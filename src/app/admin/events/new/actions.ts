'use server';

import { revalidatePath } from 'next/cache';
import { ensureEventOwnerAdmin, ensureProfileForUser, requireAuthenticatedUser } from '@/lib/auth/action-auth.ts';
import { getAdminActionErrorMessage } from '@/lib/auth/action-errors.ts';
import { HITRACE_CATEGORY_DEFINITIONS, HITRACE_SCORE_STATIONS } from '@/lib/constants.ts';
import { hashJudgeToken } from '@/lib/judge-data.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from '@/lib/supabase/server.ts';
import type { EventStatus } from '@/lib/types.ts';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const allowedTimeZones = new Set(Intl.supportedValuesOf?.('timeZone') ?? ['Europe/Rome']);

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
  const minimumValidationError = validateMinimumInput({ ...input, slug: normalizedSlug });

  if (minimumValidationError) {
    return {
      ok: false,
      error: minimumValidationError,
    };
  }

  const authResult = await getAuthenticatedEditionCreator();

  if (!authResult.ok) {
    return {
      ok: false,
      error: authResult.error,
    };
  }

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
      error: 'Verifica slug non riuscita.',
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
      owner_id: authResult.user.id,
      public_leaderboard_enabled: true,
      timezone: input.timezone.trim() || 'Europe/Rome',
    })
    .select('id,slug')
    .single();

  if (eventError || !eventRow) {
    return {
      ok: false,
      error: 'Creazione evento non riuscita.',
    };
  }

  const event = eventRow as EventInsertResult;
  const ownerAdminError = await ensureEditionOwnerAdmin(event.id, authResult.user);

  if (ownerAdminError) {
    await cleanupCreatedEvent(supabase, event.id);

    return {
      ok: false,
      error: ownerAdminError,
    };
  }

  const setupError = await createEditionStructure({
    createJudges: input.createJudges,
    defaultLaneCount: input.defaultLaneCount,
    eventId: event.id,
    raceDay: input.startsAt ? input.startsAt.slice(0, 10) : null,
    slug: normalizedSlug,
    timezone: input.timezone.trim() || 'Europe/Rome',
  }, supabase);

  if (setupError) {
    await cleanupCreatedEvent(supabase, event.id);

    return {
      ok: false,
      error: setupError,
    };
  }

  await writeEventCreatedAuditLog({
    actorUserId: authResult.user.id,
    editionLabel: input.editionLabel.trim(),
    eventId: event.id,
    slug: normalizedSlug,
    supabase,
  });

  revalidatePath('/admin/events');

  return {
    ok: true,
    redirectTo: `/admin/events/${event.slug ?? event.id}`,
  };
}

function validateMinimumInput(input: CreateEventEditionInput): string | null {
  if (!input.name.trim()) {
    return 'Il nome evento è obbligatorio.';
  }

  if (!input.editionLabel.trim()) {
    return 'Edition label obbligatoria.';
  }

  if (!input.slug.trim()) {
    return 'Slug obbligatorio.';
  }

  if (!slugPattern.test(input.slug)) {
    return 'Slug non valido: usa solo lettere minuscole, numeri e trattini.';
  }

  if (input.slug.length > 80 || input.slug.includes('/') || input.slug.includes('..')) {
    return 'Slug non valido: usa solo lettere minuscole, numeri e trattini.';
  }

  return null;
}

function validateInput(input: CreateEventEditionInput): string | null {
  const minimumError = validateMinimumInput(input);

  if (minimumError) {
    return minimumError;
  }

  if (hasForbiddenClientFields(input)) {
    return 'Dati evento non validi.';
  }

  if (input.defaultLaneCount < 1 || input.defaultLaneCount > 40) {
    return 'Il numero lane deve essere compreso tra 1 e 40.';
  }

  if (!Number.isInteger(input.defaultLaneCount)) {
    return 'Il numero lane deve essere un intero.';
  }

  const timezone = input.timezone.trim() || 'Europe/Rome';

  if (!isValidTimeZone(timezone)) {
    return 'Timezone non valida.';
  }

  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    return 'La data fine deve essere successiva alla data inizio.';
  }

  if ((input.startsAt && Number.isNaN(Date.parse(input.startsAt))) || (input.endsAt && Number.isNaN(Date.parse(input.endsAt)))) {
    return 'Formato data non valido.';
  }

  return null;
}

type AuthenticatedEditionCreatorResult =
  | {
      ok: true;
      user: Awaited<ReturnType<typeof requireAuthenticatedUser>>;
    }
  | {
      ok: false;
      error: string;
    };

async function getAuthenticatedEditionCreator(): Promise<AuthenticatedEditionCreatorResult> {
  try {
    const user = await requireAuthenticatedUser();
    await ensureProfileForUser(user);

    return {
      ok: true,
      user,
    };
  } catch (error) {
    return {
      ok: false,
      error: getAdminActionErrorMessage(error),
    };
  }
}

async function ensureEditionOwnerAdmin(eventId: string, user: Awaited<ReturnType<typeof requireAuthenticatedUser>>): Promise<string | null> {
  try {
    await ensureEventOwnerAdmin(eventId, user);
    return null;
  } catch (error) {
    return getAdminActionErrorMessage(error);
  }
}

async function createEditionStructure(input: {
  createJudges: boolean;
  defaultLaneCount: number;
  eventId: string;
  raceDay: string | null;
  slug: string;
  timezone: string;
}, supabase: ReturnType<typeof createSupabaseServiceClient>): Promise<string | null> {
  const { error: settingsError } = await supabase.from('event_settings').insert({
    event_id: input.eventId,
    default_lane_count: input.defaultLaneCount,
    default_heat_duration_minutes: 60,
    default_transition_minutes: 10,
    timezone: input.timezone,
  });

  if (settingsError) {
    return 'Creazione settings evento non riuscita.';
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
    return 'Creazione categorie standard non riuscita.';
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
    return 'Creazione stazioni non riuscita.';
  }

  if (input.createJudges) {
    const judgesError = await createStationJudges(input.eventId, input.slug, stationRows as StationInsertResult[], supabase);

    if (judgesError) {
      return judgesError;
    }
  }

  return null;
}

async function createStationJudges(
  eventId: string,
  eventSlug: string,
  stations: StationInsertResult[],
  supabase: ReturnType<typeof createSupabaseServiceClient>,
): Promise<string | null> {
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
      return `Creazione giudice ${station.name} non riuscita.`;
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
      return `Creazione assignment giudice ${station.name} non riuscita.`;
    }
  }

  return null;
}

async function writeEventCreatedAuditLog(input: {
  actorUserId: string;
  editionLabel: string;
  eventId: string;
  slug: string;
  supabase: ReturnType<typeof createSupabaseServiceClient>;
}): Promise<void> {
  await input.supabase.from('audit_logs').insert({
    event_id: input.eventId,
    entity_type: 'event',
    entity_id: input.eventId,
    action: 'created',
    actor_user_id: input.actorUserId,
    new_data: {
      edition_label: input.editionLabel,
      slug: input.slug,
      status: 'draft',
    },
    reason: 'Creazione nuova edizione da area admin',
  });
}

async function cleanupCreatedEvent(supabase: ReturnType<typeof createSupabaseServiceClient>, eventId: string): Promise<void> {
  await supabase.from('events').delete().eq('id', eventId);
}

function hasForbiddenClientFields(input: CreateEventEditionInput): boolean {
  const unsafeInput = input as CreateEventEditionInput & {
    ownerId?: unknown;
    owner_id?: unknown;
    status?: unknown;
  };

  return unsafeInput.ownerId !== undefined || unsafeInput.owner_id !== undefined || unsafeInput.status !== undefined;
}

function isValidTimeZone(timezone: string): boolean {
  if (allowedTimeZones.has(timezone)) return true;

  try {
    new Intl.DateTimeFormat('it-IT', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function toNullableTimestamp(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
