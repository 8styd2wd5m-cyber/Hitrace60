'use server';

import { revalidatePath } from 'next/cache';
import {
  ensureEventOwnerAdmin,
  ensureProfileForUser,
  requireEventOperation,
  requireEventPermissionByRouteId,
} from '@/lib/auth/action-auth.ts';
import { getAdminActionErrorMessage } from '@/lib/auth/action-errors.ts';
import { hashJudgeToken } from '@/lib/judge-data.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from '@/lib/supabase/server.ts';
import type { EventStatus } from '@/lib/types.ts';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface DuplicateEventStructureInput {
  copyCategories: boolean;
  copyJudgeTokens: boolean;
  copyJudges: boolean;
  copySettings: boolean;
  copyStations: boolean;
  editionLabel: string;
  endsAt: string;
  location: string;
  name: string;
  slug: string;
  sourceEventId: string;
  startsAt: string;
}

export type DuplicateEventStructureResult =
  | {
      ok: true;
      redirectTo: string;
    }
  | {
      ok: false;
      error: string;
    };

export interface DeleteEventEditionInput {
  routeEventId: string;
  confirmationSlug: string;
}

export type DeleteEventEditionResult =
  | {
      ok: true;
      deletedEventId: string;
    }
  | {
      ok: false;
      error: string;
    };

interface EventRow {
  id: string;
  slug?: string | null;
  status?: EventStatus;
  timezone: string | null;
}

interface EventSettingsRow {
  default_heat_duration_minutes: number;
  default_lane_count: number;
  default_transition_minutes: number;
  timezone: string;
}

interface CategoryRow {
  code: string;
  ends_at: string | null;
  name: string;
  race_day: string | null;
  start_order: number;
  starts_at: string | null;
  team_size: number;
  type: string;
}

interface StationRow {
  active: boolean;
  higher_is_better: boolean;
  id: string;
  is_scored: boolean;
  name: string;
  score_type: string;
  score_unit: string;
  slug: string;
  station_order: number;
}

interface JudgeRow {
  active: boolean;
  email: string | null;
  id: string;
  name: string;
  phone: string | null;
}

interface AssignmentRow {
  active: boolean;
  expires_at: string | null;
  judge_id: string;
  qr_url: string | null;
  station_id: string;
}

export async function duplicateEventStructureAction(
  input: DuplicateEventStructureInput,
): Promise<DuplicateEventStructureResult> {
  if (!hasSupabaseServerConfig()) {
    return {
      ok: false,
      error: 'Supabase non configurato: la duplicazione struttura richiede DB reale.',
    };
  }

  const normalizedSlug = input.slug.trim().toLowerCase();
  const validationError = validateInput({ ...input, slug: normalizedSlug });

  if (validationError) {
    return { ok: false, error: validationError };
  }

  const adminContext = await getAuthorizedEventContext(input.sourceEventId, 'duplicate_event');

  if (!adminContext.ok) {
    return { ok: false, error: adminContext.error };
  }

  const supabase = createSupabaseServiceClient();
  const { data: existingEvent, error: slugError } = await supabase
    .from('events')
    .select('id')
    .eq('slug', normalizedSlug)
    .maybeSingle();

  if (slugError) {
    return { ok: false, error: slugError.message };
  }

  if (existingEvent) {
    return { ok: false, error: 'Slug già in uso. Scegli uno slug unico.' };
  }

  const { data: sourceEvent, error: sourceEventError } = await supabase
    .from('events')
    .select('id,timezone')
    .eq('id', adminContext.context.event.id)
    .maybeSingle();

  if (sourceEventError || !sourceEvent) {
    return { ok: false, error: sourceEventError?.message ?? 'Evento sorgente non trovato.' };
  }

  const profileError = await ensureDuplicatedEventOwner(adminContext.context.user);

  if (profileError) {
    return { ok: false, error: profileError };
  }

  const timezone = (sourceEvent as EventRow).timezone ?? 'Europe/Rome';
  const { data: newEvent, error: eventError } = await supabase
    .from('events')
    .insert({
      name: input.name.trim(),
      slug: normalizedSlug,
      edition_label: input.editionLabel.trim() || null,
      location: input.location.trim() || null,
      starts_at: toNullableTimestamp(input.startsAt),
      ends_at: toNullableTimestamp(input.endsAt),
      status: 'draft' satisfies EventStatus,
      owner_id: adminContext.context.user.id,
      public_leaderboard_enabled: true,
      timezone,
      duplicated_from_event_id: adminContext.context.event.id,
    })
    .select('id,slug')
    .single();

  if (eventError || !newEvent) {
    return { ok: false, error: eventError?.message ?? 'Creazione evento duplicato non riuscita.' };
  }

  const createdEvent = newEvent as { id: string; slug: string | null };
  const ownerAdminError = await ensureDuplicatedEventAdmin(createdEvent.id, adminContext.context.user);

  if (ownerAdminError) {
    await supabase.from('events').delete().eq('id', createdEvent.id);
    return { ok: false, error: ownerAdminError };
  }

  const setupError = await copyStructure({
    copyCategories: input.copyCategories,
    copyJudgeTokens: input.copyJudgeTokens,
    copyJudges: input.copyJudges,
    copySettings: input.copySettings,
    copyStations: input.copyStations,
    newEventId: createdEvent.id,
    raceDay: input.startsAt ? input.startsAt.slice(0, 10) : null,
    newSlug: normalizedSlug,
    sourceEventId: adminContext.context.event.id,
  });

  if (setupError) {
    await supabase.from('events').delete().eq('id', createdEvent.id);
    return { ok: false, error: setupError };
  }

  revalidatePath('/admin/events');

  return {
    ok: true,
    redirectTo: `/admin/events/${createdEvent.slug ?? createdEvent.id}`,
  };
}

export async function deleteEventEditionAction(input: DeleteEventEditionInput): Promise<DeleteEventEditionResult> {
  if (!hasSupabaseServerConfig()) {
    return {
      ok: false,
      error: 'Supabase non configurato: eliminazione disponibile solo con DB reale.',
    };
  }

  if (!input.routeEventId.trim() || !input.confirmationSlug.trim()) {
    return { ok: false, error: 'Dati non validi.' };
  }

  const adminContext = await getAuthorizedEventContext(input.routeEventId, 'delete_event');

  if (!adminContext.ok) {
    return { ok: false, error: adminContext.error };
  }

  const expectedSlug = adminContext.context.event.slug ?? input.routeEventId;

  if (input.confirmationSlug.trim() !== expectedSlug) {
    return { ok: false, error: `Digita esattamente "${expectedSlug}" per eliminare questa edizione.` };
  }

  const deleteError = await deleteEventGraph(adminContext.context.event.id);

  if (deleteError) {
    return { ok: false, error: deleteError };
  }

  revalidatePath('/admin/events');

  return {
    ok: true,
    deletedEventId: adminContext.context.event.id,
  };
}

type AuthorizedEventContextResult =
  | {
      ok: true;
      context: Awaited<ReturnType<typeof requireEventPermissionByRouteId>>;
    }
  | {
      ok: false;
      error: string;
    };

async function getAuthorizedEventContext(
  routeEventId: string,
  operation: Parameters<typeof requireEventOperation>[1],
): Promise<AuthorizedEventContextResult> {
  try {
    const permission = operation === 'delete_event' ? 'event.delete' : 'event.duplicate';
    const context = await requireEventPermissionByRouteId(routeEventId, permission);
    requireEventOperation(context, operation);

    return {
      ok: true,
      context,
    };
  } catch (error) {
    return {
      ok: false,
      error: getAdminActionErrorMessage(error),
    };
  }
}

async function ensureDuplicatedEventOwner(user: Awaited<ReturnType<typeof requireEventPermissionByRouteId>>['user']): Promise<string | null> {
  try {
    await ensureProfileForUser(user);
    return null;
  } catch (error) {
    return getAdminActionErrorMessage(error);
  }
}

async function ensureDuplicatedEventAdmin(
  eventId: string,
  user: Awaited<ReturnType<typeof requireEventPermissionByRouteId>>['user'],
): Promise<string | null> {
  try {
    await ensureEventOwnerAdmin(eventId, user);
    return null;
  } catch (error) {
    return getAdminActionErrorMessage(error);
  }
}

async function deleteEventGraph(eventId: string): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const deleteSteps: Array<() => Promise<{ error: { message: string } | null }>> = [
    async () => await supabase.from('audit_logs').delete().eq('event_id', eventId),
    async () => await supabase.from('scores').delete().eq('event_id', eventId),
    async () => await supabase.from('scorecards').delete().eq('event_id', eventId),
    async () => await supabase.from('timeline_blocks').delete().eq('event_id', eventId),
    async () => await supabase.from('judge_station_assignments').delete().eq('event_id', eventId),
    async () => await supabase.from('heats').delete().eq('event_id', eventId),
    async () => await supabase.from('participants').delete().eq('event_id', eventId),
    async () => await supabase.from('judges').delete().eq('event_id', eventId),
    async () => await supabase.from('stations').delete().eq('event_id', eventId),
    async () => await supabase.from('categories').delete().eq('event_id', eventId),
    async () => await supabase.from('event_settings').delete().eq('event_id', eventId),
    async () => await supabase.from('event_admins').delete().eq('event_id', eventId),
    async () => await supabase.from('events').delete().eq('id', eventId),
  ];

  for (const deleteStep of deleteSteps) {
    const { error } = await deleteStep();

    if (error) {
      return error.message;
    }
  }

  return null;
}

function validateInput(input: DuplicateEventStructureInput): string | null {
  if (!input.name.trim()) return 'Il nome evento è obbligatorio.';
  if (!slugPattern.test(input.slug)) return 'Slug non valido: usa solo lettere minuscole, numeri e trattini.';

  if (input.startsAt && Number.isNaN(Date.parse(input.startsAt))) return 'Data inizio non valida.';
  if (input.endsAt && Number.isNaN(Date.parse(input.endsAt))) return 'Data fine non valida.';
  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    return 'La data fine deve essere successiva alla data inizio.';
  }

  if (input.copyJudges && !input.copyStations) {
    return 'Per copiare i giudici devi copiare anche le stazioni.';
  }

  return null;
}

async function copyStructure(input: {
  copyCategories: boolean;
  copyJudgeTokens: boolean;
  copyJudges: boolean;
  copySettings: boolean;
  copyStations: boolean;
  newEventId: string;
  raceDay: string | null;
  newSlug: string;
  sourceEventId: string;
}): Promise<string | null> {
  const supabase = createSupabaseServiceClient();

  if (input.copySettings) {
    const { data, error } = await supabase
      .from('event_settings')
      .select('default_lane_count,default_heat_duration_minutes,default_transition_minutes,timezone')
      .eq('event_id', input.sourceEventId)
      .maybeSingle();

    if (error) return error.message;

    if (data) {
      const settings = data as EventSettingsRow;
      const { error: insertError } = await supabase.from('event_settings').insert({
        event_id: input.newEventId,
        default_lane_count: settings.default_lane_count,
        default_heat_duration_minutes: settings.default_heat_duration_minutes,
        default_transition_minutes: settings.default_transition_minutes,
        timezone: settings.timezone,
      });

      if (insertError) return insertError.message;
    }
  }

  if (input.copyCategories) {
    const { data, error } = await supabase
      .from('categories')
      .select('code,name,type,team_size,race_day,start_order,starts_at,ends_at')
      .eq('event_id', input.sourceEventId)
      .order('start_order', { ascending: true });

    if (error) return error.message;

    const rows = ((data ?? []) as CategoryRow[]).map((category) => ({
      event_id: input.newEventId,
      code: category.code,
      name: category.name,
      type: category.type,
      team_size: category.team_size,
      race_day: input.raceDay ?? category.race_day,
      start_order: category.start_order,
      starts_at: null,
      ends_at: null,
    }));

    if (rows.length) {
      const { error: insertError } = await supabase.from('categories').insert(rows);
      if (insertError) return insertError.message;
    }
  }

  const stationIdBySourceId = input.copyStations ? await copyStations(input.sourceEventId, input.newEventId) : new Map<string, string>();

  if (typeof stationIdBySourceId === 'string') {
    return stationIdBySourceId;
  }

  if (input.copyJudges) {
    const judgesError = await copyJudges({
      copyJudgeTokens: input.copyJudgeTokens,
      newEventId: input.newEventId,
      newSlug: input.newSlug,
      sourceEventId: input.sourceEventId,
      stationIdBySourceId,
    });

    if (judgesError) return judgesError;
  }

  return null;
}

async function copyStations(sourceEventId: string, newEventId: string): Promise<Map<string, string> | string> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('stations')
    .select('id,name,slug,station_order,score_type,score_unit,is_scored,higher_is_better,active')
    .eq('event_id', sourceEventId)
    .order('station_order', { ascending: true });

  if (error) return error.message;

  const stationIdBySourceId = new Map<string, string>();

  for (const station of (data ?? []) as StationRow[]) {
    const { data: insertedStation, error: insertError } = await supabase
      .from('stations')
      .insert({
        event_id: newEventId,
        name: station.name,
        slug: station.slug,
        station_order: station.station_order,
        score_type: station.score_type,
        score_unit: station.score_unit,
        is_scored: station.is_scored,
        higher_is_better: station.higher_is_better,
        active: station.active,
      })
      .select('id')
      .single();

    if (insertError || !insertedStation) {
      return insertError?.message ?? `Duplicazione stazione ${station.name} non riuscita.`;
    }

    stationIdBySourceId.set(station.id, (insertedStation as { id: string }).id);
  }

  return stationIdBySourceId;
}

async function copyJudges(input: {
  copyJudgeTokens: boolean;
  newEventId: string;
  newSlug: string;
  sourceEventId: string;
  stationIdBySourceId: Map<string, string>;
}): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const [judgesResult, assignmentsResult, stationsResult] = await Promise.all([
    supabase.from('judges').select('id,name,email,phone,active').eq('event_id', input.sourceEventId),
    supabase.from('judge_station_assignments').select('judge_id,station_id,qr_url,active,expires_at').eq('event_id', input.sourceEventId),
    supabase.from('stations').select('id,slug').eq('event_id', input.sourceEventId),
  ]);
  const firstError = judgesResult.error ?? assignmentsResult.error ?? stationsResult.error;

  if (firstError) return firstError.message;

  const sourceStationSlugById = new Map(((stationsResult.data ?? []) as Array<{ id: string; slug: string }>).map((station) => [station.id, station.slug]));
  const assignmentsByJudgeId = new Map<string, AssignmentRow[]>();

  for (const assignment of (assignmentsResult.data ?? []) as AssignmentRow[]) {
    assignmentsByJudgeId.set(assignment.judge_id, [...(assignmentsByJudgeId.get(assignment.judge_id) ?? []), assignment]);
  }

  for (const judge of (judgesResult.data ?? []) as JudgeRow[]) {
    const { data: insertedJudge, error: judgeError } = await supabase
      .from('judges')
      .insert({
        event_id: input.newEventId,
        name: judge.name,
        email: judge.email,
        phone: judge.phone,
        active: judge.active,
      })
      .select('id')
      .single();

    if (judgeError || !insertedJudge) {
      return judgeError?.message ?? `Duplicazione giudice ${judge.name} non riuscita.`;
    }

    for (const assignment of assignmentsByJudgeId.get(judge.id) ?? []) {
      const newStationId = input.stationIdBySourceId.get(assignment.station_id);
      const stationSlug = sourceStationSlugById.get(assignment.station_id);

      if (!newStationId || !stationSlug) continue;

      const token = createJudgeTokenForDuplicatedEvent({
        copyJudgeTokens: input.copyJudgeTokens,
        newSlug: input.newSlug,
        qrUrl: assignment.qr_url,
        stationSlug,
      });
      const { error: assignmentError } = await supabase.from('judge_station_assignments').insert({
        event_id: input.newEventId,
        judge_id: (insertedJudge as { id: string }).id,
        station_id: newStationId,
        token_hash: hashJudgeToken(token),
        qr_url: `/judge/${token}`,
        active: assignment.active,
        expires_at: assignment.expires_at,
      });

      if (assignmentError) return assignmentError.message;
    }
  }

  return null;
}

function extractJudgeTokenFromQrUrl(qrUrl: string | null): string | null {
  if (!qrUrl) return null;

  const match = qrUrl.match(/\/judge\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function createJudgeTokenForDuplicatedEvent(input: {
  copyJudgeTokens: boolean;
  newSlug: string;
  qrUrl: string | null;
  stationSlug: string;
}): string {
  const sourceToken = input.copyJudgeTokens ? extractJudgeTokenFromQrUrl(input.qrUrl) : null;

  if (sourceToken?.includes(input.newSlug)) {
    return sourceToken;
  }

  return `judge-${input.stationSlug}-${input.newSlug}-token`;
}

function toNullableTimestamp(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
