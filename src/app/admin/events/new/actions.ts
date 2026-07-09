'use server';

import { HITRACE_CATEGORY_DEFINITIONS, HITRACE_SCORE_STATIONS } from '@/lib/constants.ts';
import { hashJudgeToken } from '@/lib/judge-data.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from '@/lib/supabase/server.ts';
import type { EventStatus } from '@/lib/types.ts';

const SEEDED_ADMIN_OWNER_ID = '00000000-0000-0000-0000-000000000001';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CreateEventEditionInput {
  createJudges: boolean;
  defaultLaneCount: number;
  editionLabel: string;
  endsAt: string;
  location: string;
  name: string;
  slug: string;
  startsAt: string;
  timezone: string;
}

export type CreateEventEditionResult =
  | {
      ok: true;
      redirectTo: string;
    }
  | {
      ok: false;
      error: string;
    };

interface EventInsertResult {
  id: string;
  slug: string | null;
}

interface StationInsertResult {
  id: string;
  name: string;
  slug: string;
}

export async function createEventEditionAction(input: CreateEventEditionInput): Promise<CreateEventEditionResult> {
  if (!hasSupabaseServerConfig()) {
    return {
      ok: false,
      error: 'Supabase non configurato: crea .env.local prima di creare edizioni reali.',
    };
  }

  const normalizedSlug = input.slug.trim().toLowerCase();
  const validationError = validateInput({ ...input, slug: normalizedSlug });

  if (validationError) {
    return {
      ok: false,
      error: validationError,
    };
  }

  const supabase = createSupabaseServiceClient();
  const { data: existingEvent, error: slugError } = await supabase
    .from('events')
    .select('id')
    .eq('slug', normalizedSlug)
    .maybeSingle();

  if (slugError) {
    return {
      ok: false,
      error: slugError.message,
    };
  }

  if (existingEvent) {
    return {
      ok: false,
      error: 'Slug già in uso. Scegli uno slug unico per questa edizione.',
    };
  }

  const { data: eventRow, error: eventError } = await supabase
    .from('events')
    .insert({
      name: input.name.trim(),
      slug: normalizedSlug,
      edition_label: input.editionLabel.trim() || null,
      location: input.location.trim() || null,
      starts_at: toNullableTimestamp(input.startsAt),
      ends_at: toNullableTimestamp(input.endsAt),
      status: 'draft' satisfies EventStatus,
      owner_id: SEEDED_ADMIN_OWNER_ID,
      public_leaderboard_enabled: true,
      timezone: input.timezone.trim() || 'Europe/Rome',
    })
    .select('id,slug')
    .single();

  if (eventError || !eventRow) {
    return {
      ok: false,
      error: eventError?.message ?? 'Creazione evento non riuscita.',
    };
  }

  const event = eventRow as EventInsertResult;
  const setupError = await createEditionStructure({
    createJudges: input.createJudges,
    defaultLaneCount: input.defaultLaneCount,
    eventId: event.id,
    raceDay: input.startsAt ? input.startsAt.slice(0, 10) : null,
    slug: normalizedSlug,
    timezone: input.timezone.trim() || 'Europe/Rome',
  });

  if (setupError) {
    await supabase.from('events').delete().eq('id', event.id);

    return {
      ok: false,
      error: setupError,
    };
  }

  return {
    ok: true,
    redirectTo: `/admin/events/${event.slug ?? event.id}`,
  };
}

function validateInput(input: CreateEventEditionInput): string | null {
  if (!input.name.trim()) {
    return 'Il nome evento è obbligatorio.';
  }

  if (!slugPattern.test(input.slug)) {
    return 'Slug non valido: usa solo lettere minuscole, numeri e trattini.';
  }

  if (input.defaultLaneCount < 1 || input.defaultLaneCount > 40) {
    return 'Il numero lane deve essere compreso tra 1 e 40.';
  }

  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    return 'La data fine deve essere successiva alla data inizio.';
  }

  if ((input.startsAt && Number.isNaN(Date.parse(input.startsAt))) || (input.endsAt && Number.isNaN(Date.parse(input.endsAt)))) {
    return 'Formato data non valido.';
  }

  return null;
}

async function createEditionStructure(input: {
  createJudges: boolean;
  defaultLaneCount: number;
  eventId: string;
  raceDay: string | null;
  slug: string;
  timezone: string;
}): Promise<string | null> {
  const supabase = createSupabaseServiceClient();

  const { error: settingsError } = await supabase.from('event_settings').insert({
    event_id: input.eventId,
    default_lane_count: input.defaultLaneCount,
    default_heat_duration_minutes: 60,
    default_transition_minutes: 10,
    timezone: input.timezone,
  });

  if (settingsError) {
    return settingsError.message;
  }

  const { error: categoriesError } = await supabase.from('categories').insert(
    HITRACE_CATEGORY_DEFINITIONS.map((category) => ({
      event_id: input.eventId,
      code: category.code,
      name: category.name,
      type: category.type,
      team_size: category.teamSize,
      race_day: input.raceDay,
      start_order: category.startOrder,
    })),
  );

  if (categoriesError) {
    return categoriesError.message;
  }

  const { data: stationRows, error: stationsError } = await supabase
    .from('stations')
    .insert(
      HITRACE_SCORE_STATIONS.map((station) => ({
        event_id: input.eventId,
        name: station.name,
        slug: station.slug,
        station_order: station.stationOrder,
        score_type: station.scoreType,
        score_unit: station.scoreUnit,
        is_scored: station.isScored,
        higher_is_better: station.higherIsBetter,
        active: true,
      })),
    )
    .select('id,name,slug');

  if (stationsError || !stationRows) {
    return stationsError?.message ?? 'Creazione stazioni non riuscita.';
  }

  if (input.createJudges) {
    const judgesError = await createStationJudges(input.eventId, input.slug, stationRows as StationInsertResult[]);

    if (judgesError) {
      return judgesError;
    }
  }

  return null;
}

async function createStationJudges(eventId: string, eventSlug: string, stations: StationInsertResult[]): Promise<string | null> {
  const supabase = createSupabaseServiceClient();

  for (const station of stations) {
    const token = `judge-${station.slug}-${eventSlug}-token`;
    const { data: judgeRow, error: judgeError } = await supabase
      .from('judges')
      .insert({
        event_id: eventId,
        name: `Giudice ${station.name}`,
        active: true,
      })
      .select('id')
      .single();

    if (judgeError || !judgeRow) {
      return judgeError?.message ?? `Creazione giudice ${station.name} non riuscita.`;
    }

    const { error: assignmentError } = await supabase.from('judge_station_assignments').insert({
      event_id: eventId,
      judge_id: (judgeRow as { id: string }).id,
      station_id: station.id,
      token_hash: hashJudgeToken(token),
      qr_url: `/judge/${token}`,
      active: true,
    });

    if (assignmentError) {
      return assignmentError.message;
    }
  }

  return null;
}

function toNullableTimestamp(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
