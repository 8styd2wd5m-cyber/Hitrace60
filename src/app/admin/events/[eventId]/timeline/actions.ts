'use server';

import { revalidatePath } from 'next/cache';
import { requireEventOperation, requireEventPermissionByRouteId } from '@/lib/auth/action-auth.ts';
import { getAdminActionErrorMessage } from '@/lib/auth/action-errors.ts';
import { getRaceStationOrderBySlug } from '@/lib/constants.ts';
import { isUuid } from '@/lib/event-id.ts';
import { generateScorecardsFromTimeline } from '@/lib/scorecards.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from '@/lib/supabase/server.ts';
import { generateHeatsForCategory, stableUuidFromString } from '@/lib/timeline.ts';
import type { Category, Heat, HeatParticipant, Participant, ParticipantStatus, Station, TimelineBlock } from '@/lib/types.ts';

interface SaveTimelineInput {
  eventId: string;
  routeEventId: string;
  selectedCategoryIds: string[];
  categoryStarts: Record<string, string>;
  laneCount: number;
  workIntervalSeconds: number;
  stationTransitionSeconds: number;
  totalStations: number;
  pauseAfterCategoryMinutes: number;
}

export interface SaveTimelineResult {
  ok: boolean;
  message: string;
  counts?: {
    heatParticipants: number;
    heats: number;
    scorecards: number;
    timelineBlocks: number;
  };
}

interface CategoryRow {
  id: string;
  event_id: string;
  code: Category['code'];
  name: string;
  type: Category['type'];
  team_size: 1 | 2 | 3;
  race_day: string | null;
  start_order: number;
}

interface ParticipantRow {
  id: string;
  event_id: string;
  category_id: string;
  display_name: string;
  bib_number: string | null;
  status: ParticipantStatus;
  seed_order: number;
}

interface StationRow {
  id: string;
  event_id: string;
  name: string;
  slug: string;
  station_order: number;
  score_type: string;
  score_unit: string;
  is_scored: boolean;
  higher_is_better: boolean;
  active: boolean;
}

interface JudgeAssignmentRow {
  id: string;
  station_id: string;
}

interface ExistingHeatRow {
  id: string;
  category_id: string;
  event_id: string;
  heat_number: number;
}

export async function saveTimelineAction(input: SaveTimelineInput): Promise<SaveTimelineResult> {
  if (!hasSupabaseServerConfig()) {
    return { ok: false, message: 'Supabase non configurato: salvataggio timeline disabilitato.' };
  }

  const minimumValidationError = validateMinimumTimelineInput(input);

  if (minimumValidationError) {
    return { ok: false, message: minimumValidationError };
  }

  const adminContext = await getAuthorizedTimelineContext(input.routeEventId);

  if (!adminContext.ok) {
    return { ok: false, message: adminContext.error };
  }

  const eventId = adminContext.context.event.id;

  if (eventId !== input.eventId) {
    return { ok: false, message: 'Event ID non coerente con la sorgente dati.' };
  }

  const selectedCategoryIds = [...new Set(input.selectedCategoryIds)];
  const supabase = createSupabaseServiceClient();
  const [categoriesResult, participantsResult, stationsResult, assignmentsResult, existingHeatsResult] = await Promise.all([
    supabase
      .from('categories')
      .select('id,event_id,code,name,type,team_size,race_day,start_order')
      .eq('event_id', eventId)
      .in('id', selectedCategoryIds),
    supabase
      .from('participants')
      .select('id,event_id,category_id,display_name,bib_number,status,seed_order')
      .eq('event_id', eventId),
    supabase
      .from('stations')
      .select('id,event_id,name,slug,station_order,score_type,score_unit,is_scored,higher_is_better,active')
      .eq('event_id', eventId)
      .eq('is_scored', true)
      .eq('active', true),
    supabase.from('judge_station_assignments').select('id,station_id').eq('event_id', eventId).eq('active', true),
    supabase
      .from('heats')
      .select('id,event_id,category_id,heat_number')
      .eq('event_id', eventId)
      .in('category_id', selectedCategoryIds),
  ]);

  const firstError =
    categoriesResult.error ??
    participantsResult.error ??
    stationsResult.error ??
    assignmentsResult.error ??
    existingHeatsResult.error;

  if (firstError) {
    return { ok: false, message: 'Timeline non valida o dati evento non disponibili.' };
  }

  const categories = ((categoriesResult.data ?? []) as CategoryRow[]).map(mapCategory);
  const participants = ((participantsResult.data ?? []) as ParticipantRow[]).map(mapParticipant);
  const stations = ((stationsResult.data ?? []) as StationRow[]).map(mapStation);
  const assignments = (assignmentsResult.data ?? []) as JudgeAssignmentRow[];
  const ownershipError = validateTimelineOwnership({
    categories,
    eventId,
    existingHeats: (existingHeatsResult.data ?? []) as ExistingHeatRow[],
    participants,
    selectedCategoryIds,
    stations,
  });

  if (ownershipError) {
    return { ok: false, message: ownershipError };
  }

  const assignmentIdByStationId = new Map(assignments.map((assignment) => [assignment.station_id, assignment.id]));
  const existingHeatIdByKey = new Map(
    ((existingHeatsResult.data ?? []) as ExistingHeatRow[]).map((heat) => [
      heatKey(heat.category_id, heat.heat_number),
      heat.id,
    ]),
  );
  const allHeats: Heat[] = [];
  const allHeatParticipants: HeatParticipant[] = [];
  const allTimelineBlocks: TimelineBlock[] = [];

  try {
    for (const category of categories.sort((a, b) => a.startOrder - b.startOrder)) {
    const startsAt = input.categoryStarts[category.id];

    if (!startsAt || !Number.isFinite(Date.parse(startsAt))) {
      return { ok: false, message: `Start categoria non valido per ${category.name}.` };
    }

    const generated = generateHeatsForCategory({
      eventId,
      categoryId: category.id,
      participants,
      laneCount: input.laneCount,
      startsAt,
      idMode: 'uuid',
      workIntervalSeconds: input.workIntervalSeconds,
      stationTransitionSeconds: input.stationTransitionSeconds,
      totalStations: input.totalStations,
      pauseAfterCategoryMinutes: input.pauseAfterCategoryMinutes,
    });
    const generatedHeatIdToPersistedHeatId = new Map<string, string>();

    for (const heat of generated.heats) {
      const existingHeatId = existingHeatIdByKey.get(heatKey(heat.categoryId, heat.heatNumber));

      if (existingHeatId) {
        generatedHeatIdToPersistedHeatId.set(heat.id, existingHeatId);
        heat.id = existingHeatId;
      }
    }

    for (const heatParticipant of generated.heatParticipants) {
      const persistedHeatId = generatedHeatIdToPersistedHeatId.get(heatParticipant.heatId);

      if (persistedHeatId) {
        heatParticipant.heatId = persistedHeatId;
        heatParticipant.id = stableUuidFromString(
          `heat-participant:${eventId}:${persistedHeatId}:${heatParticipant.participantId}:${heatParticipant.laneNumber}`,
        );
      }
    }

    allHeats.push(...generated.heats);
    allHeatParticipants.push(...generated.heatParticipants);
    allTimelineBlocks.push(...generated.timelineBlocks);
    }
  } catch {
    return { ok: false, message: 'Timeline non valida: verifica heat, lane e parametri temporali.' };
  }

  if (allHeats.length === 0) {
    return { ok: false, message: 'Nessuna heat generata: verifica partecipanti e categorie.' };
  }

  const generatedValidationError = validateGeneratedTimeline({
    eventId,
    heatParticipants: allHeatParticipants,
    heats: allHeats,
    participants,
    selectedCategoryIds,
    stations,
    timelineBlocks: allTimelineBlocks,
  });

  if (generatedValidationError) {
    return { ok: false, message: generatedValidationError };
  }

  const heatRows = allHeats.map((heat) => ({
    id: heat.id,
    event_id: heat.eventId,
    category_id: heat.categoryId,
    heat_number: heat.heatNumber,
    starts_at: heat.startsAt,
    ends_at: heat.endsAt,
    lane_count: heat.laneCount,
    status: heat.status,
  }));
  const { error: deleteScorecardsError } = await supabase
    .from('scorecards')
    .delete()
    .eq('event_id', eventId)
    .in('heat_id', ((existingHeatsResult.data ?? []) as ExistingHeatRow[]).map((heat) => heat.id));

  if (deleteScorecardsError) {
    return { ok: false, message: 'Salvataggio timeline non riuscito.' };
  }

  const { error: deleteTimelineBlocksError } = await supabase
    .from('timeline_blocks')
    .delete()
    .eq('event_id', eventId)
    .in('category_id', selectedCategoryIds);

  if (deleteTimelineBlocksError) {
    return { ok: false, message: 'Salvataggio timeline non riuscito.' };
  }

  const { error: deleteOldHeatParticipantsError } = await supabase
    .from('heat_participants')
    .delete()
    .in('heat_id', ((existingHeatsResult.data ?? []) as ExistingHeatRow[]).map((heat) => heat.id));

  if (deleteOldHeatParticipantsError) {
    return { ok: false, message: 'Salvataggio timeline non riuscito.' };
  }

  const { error: heatsError } = await supabase.from('heats').upsert(heatRows, { onConflict: 'event_id,category_id,heat_number' });

  if (heatsError) {
    return { ok: false, message: 'Salvataggio heat non riuscito.' };
  }

  const heatParticipantRows = allHeatParticipants.map((heatParticipant) => ({
    id: heatParticipant.id,
    heat_id: heatParticipant.heatId,
    participant_id: heatParticipant.participantId,
    lane_number: heatParticipant.laneNumber,
    lane_label: heatParticipant.laneLabel ?? `Lane ${heatParticipant.laneNumber}`,
  }));
  const { error: heatParticipantsError } = await supabase.from('heat_participants').insert(heatParticipantRows);

  if (heatParticipantsError) {
    return { ok: false, message: 'Salvataggio lane partecipanti non riuscito.' };
  }

  const timelineBlockRows = allTimelineBlocks.map((block) => ({
    id: block.id,
    event_id: block.eventId,
    heat_id: block.heatId ?? null,
    category_id: block.categoryId ?? null,
    block_type: block.blockType,
    title: block.title,
    race_day: block.startsAt.slice(0, 10),
    starts_at: block.startsAt,
    ends_at: block.endsAt,
    sort_order: block.sortOrder,
    notes: block.notes ?? null,
  }));
  const { error: timelineBlocksError } = await supabase.from('timeline_blocks').upsert(timelineBlockRows, { onConflict: 'id' });

  if (timelineBlocksError) {
    return { ok: false, message: 'Salvataggio blocchi timeline non riuscito.' };
  }

  const generatedScorecards = generateScorecardsFromTimeline({
    eventId,
    heats: allHeats,
    heatParticipants: allHeatParticipants,
    participants,
    stations,
  });
  const scorecardRows = generatedScorecards.map((scorecard) => ({
    event_id: scorecard.eventId,
    judge_assignment_id: assignmentIdByStationId.get(scorecard.stationId) ?? null,
    station_id: scorecard.stationId,
    heat_id: scorecard.heatId,
    participant_id: scorecard.participantId,
    status: 'generated',
  }));
  const scorecardValidationError = validateGeneratedScorecards({
    eventId,
    heatIds: new Set(allHeats.map((heat) => heat.id)),
    participantIds: new Set(participants.map((participant) => participant.id)),
    scorecardRows,
    stationIds: new Set(stations.map((station) => station.id)),
  });

  if (scorecardValidationError) {
    return { ok: false, message: scorecardValidationError };
  }

  const { error: scorecardsError } = await supabase
    .from('scorecards')
    .upsert(scorecardRows, { onConflict: 'event_id,station_id,heat_id,participant_id' });

  if (scorecardsError) {
    return { ok: false, message: 'Salvataggio scorecard non riuscito.' };
  }

  await writeTimelineAuditLog({
    actorUserId: adminContext.context.user.id,
    eventId,
    heatCount: allHeats.length,
    heatParticipantCount: allHeatParticipants.length,
    laneCount: input.laneCount,
    scorecardCount: generatedScorecards.length,
    supabase,
    timelineBlockCount: allTimelineBlocks.length,
  });

  revalidatePath(`/admin/events/${input.routeEventId}/timeline`);
  revalidatePath(`/display/${input.routeEventId}`);

  return {
    ok: true,
    message: 'Timeline salvata su DB reale.',
    counts: {
      heats: allHeats.length,
      heatParticipants: allHeatParticipants.length,
      timelineBlocks: allTimelineBlocks.length,
      scorecards: generatedScorecards.length,
    },
  };
}

type AuthorizedTimelineContextResult =
  | {
      ok: true;
      context: Awaited<ReturnType<typeof requireEventPermissionByRouteId>>;
    }
  | {
      ok: false;
      error: string;
    };

async function getAuthorizedTimelineContext(routeEventId: string): Promise<AuthorizedTimelineContextResult> {
  try {
    const context = await requireEventPermissionByRouteId(routeEventId, 'timeline.manage');
    requireEventOperation(context, 'manage_timeline');

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

function validateMinimumTimelineInput(input: SaveTimelineInput): string | null {
  if (!input.routeEventId.trim() || !isUuid(input.eventId)) return 'Timeline non valida.';
  if (!Array.isArray(input.selectedCategoryIds) || input.selectedCategoryIds.length === 0) return 'Seleziona almeno una categoria.';
  if (new Set(input.selectedCategoryIds).size !== input.selectedCategoryIds.length) return 'Categorie duplicate non valide.';
  if (input.selectedCategoryIds.some((categoryId) => !isUuid(categoryId))) return 'Categoria non valida.';
  if (!Number.isInteger(input.laneCount) || input.laneCount <= 0 || input.laneCount > 64) return 'Lane non valide.';
  if (!Number.isFinite(input.workIntervalSeconds) || input.workIntervalSeconds <= 0 || input.workIntervalSeconds > 3600) return 'Intervallo lavoro non valido.';
  if (!Number.isFinite(input.stationTransitionSeconds) || input.stationTransitionSeconds < 0 || input.stationTransitionSeconds > 600) return 'Transizione stazione non valida.';
  if (!Number.isInteger(input.totalStations) || input.totalStations <= 0 || input.totalStations > 30) return 'Numero stazioni non valido.';
  if (!Number.isFinite(input.pauseAfterCategoryMinutes) || input.pauseAfterCategoryMinutes < 0 || input.pauseAfterCategoryMinutes > 240) return 'Pausa categoria non valida.';

  for (const categoryId of input.selectedCategoryIds) {
    const startsAt = input.categoryStarts[categoryId];

    if (!startsAt || !Number.isFinite(Date.parse(startsAt))) {
      return 'Start categoria non valido.';
    }
  }

  return null;
}

function validateTimelineOwnership(input: {
  categories: Category[];
  eventId: string;
  existingHeats: ExistingHeatRow[];
  participants: Participant[];
  selectedCategoryIds: string[];
  stations: Station[];
}): string | null {
  if (input.categories.length !== input.selectedCategoryIds.length) return 'Categoria non valida.';
  if (input.categories.some((category) => category.eventId !== input.eventId)) return 'Categoria non valida.';
  if (input.participants.some((participant) => participant.eventId !== input.eventId)) return 'Partecipante non valido.';
  if (input.stations.length === 0 || input.stations.some((station) => station.eventId !== input.eventId)) return 'Stazioni non valide.';
  if (input.existingHeats.some((heat) => heat.event_id !== input.eventId)) return 'Heat non valida.';

  const categoryIds = new Set(input.categories.map((category) => category.id));

  if (input.participants.some((participant) => !categoryIds.has(participant.categoryId))) {
    return 'Partecipante non valido.';
  }

  if (input.existingHeats.some((heat) => !categoryIds.has(heat.category_id))) {
    return 'Heat non valida.';
  }

  return null;
}

function validateGeneratedTimeline(input: {
  eventId: string;
  heatParticipants: HeatParticipant[];
  heats: Heat[];
  participants: Participant[];
  selectedCategoryIds: string[];
  stations: Station[];
  timelineBlocks: TimelineBlock[];
}): string | null {
  const categoryIds = new Set(input.selectedCategoryIds);
  const heatIds = new Set<string>();
  const participantIds = new Set(input.participants.map((participant) => participant.id));
  const assignedParticipantIds = new Set<string>();

  for (const heat of input.heats) {
    if (heat.eventId !== input.eventId || !categoryIds.has(heat.categoryId)) return 'Heat non valida.';
    if (!Number.isInteger(heat.heatNumber) || heat.heatNumber <= 0) return 'Heat non valida.';
    if (!Number.isInteger(heat.laneCount) || heat.laneCount <= 0) return 'Lane non valide.';
    if (!Number.isFinite(Date.parse(heat.startsAt)) || !Number.isFinite(Date.parse(heat.endsAt))) return 'Timeline non valida.';
    if (Date.parse(heat.endsAt) <= Date.parse(heat.startsAt)) return 'Timeline non valida.';
    if (heatIds.has(heat.id)) return 'Heat non valida.';
    heatIds.add(heat.id);
  }

  const laneKeys = new Set<string>();

  for (const heatParticipant of input.heatParticipants) {
    if (!heatIds.has(heatParticipant.heatId)) return 'Heat non valida.';
    if (!participantIds.has(heatParticipant.participantId)) return 'Partecipante non valido.';
    if (!Number.isInteger(heatParticipant.laneNumber) || heatParticipant.laneNumber <= 0) return 'Lane non valide.';

    const laneKey = `${heatParticipant.heatId}:${heatParticipant.laneNumber}`;

    if (laneKeys.has(laneKey)) return 'Lane duplicate non valide.';
    laneKeys.add(laneKey);

    if (assignedParticipantIds.has(heatParticipant.participantId)) return 'Partecipante duplicato non valido.';
    assignedParticipantIds.add(heatParticipant.participantId);
  }

  for (const block of input.timelineBlocks) {
    if (block.eventId !== input.eventId) return 'Timeline non valida.';
    if (block.categoryId && !categoryIds.has(block.categoryId)) return 'Timeline non valida.';
    if (!Number.isFinite(Date.parse(block.startsAt)) || !Number.isFinite(Date.parse(block.endsAt))) return 'Timeline non valida.';
    if (Date.parse(block.endsAt) <= Date.parse(block.startsAt)) return 'Timeline non valida.';
  }

  if (input.stations.some((station) => !station.active || !station.isScored || station.eventId !== input.eventId)) return 'Stazioni non valide.';

  return null;
}

function validateGeneratedScorecards(input: {
  eventId: string;
  heatIds: Set<string>;
  participantIds: Set<string>;
  scorecardRows: Array<{
    event_id: string;
    heat_id: string;
    participant_id: string;
    station_id: string;
  }>;
  stationIds: Set<string>;
}): string | null {
  for (const scorecard of input.scorecardRows) {
    if (scorecard.event_id !== input.eventId) return 'Scorecard non valida.';
    if (!input.heatIds.has(scorecard.heat_id)) return 'Scorecard non valida.';
    if (!input.participantIds.has(scorecard.participant_id)) return 'Scorecard non valida.';
    if (!input.stationIds.has(scorecard.station_id)) return 'Scorecard non valida.';
  }

  return null;
}

async function writeTimelineAuditLog(input: {
  actorUserId: string;
  eventId: string;
  heatCount: number;
  heatParticipantCount: number;
  laneCount: number;
  scorecardCount: number;
  supabase: ReturnType<typeof createSupabaseServiceClient>;
  timelineBlockCount: number;
}): Promise<void> {
  await input.supabase.from('audit_logs').insert({
    event_id: input.eventId,
    entity_type: 'event',
    entity_id: input.eventId,
    action: 'updated',
    actor_user_id: input.actorUserId,
    new_data: {
      heat_count: input.heatCount,
      heat_participant_count: input.heatParticipantCount,
      lane_count: input.laneCount,
      scorecard_count: input.scorecardCount,
      timeline_block_count: input.timelineBlockCount,
    },
    reason: 'Salvataggio timeline da area admin',
  });
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    eventId: row.event_id,
    code: row.code,
    name: row.name,
    type: row.type,
    teamSize: row.team_size,
    raceDay: row.race_day,
    startOrder: row.start_order,
  };
}

function mapParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    eventId: row.event_id,
    categoryId: row.category_id,
    displayName: row.display_name,
    bibNumber: row.bib_number,
    status: row.status,
    seedOrder: row.seed_order,
  };
}

function mapStation(row: StationRow): Station {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    slug: row.slug,
    stationOrder: row.station_order,
    raceStationOrder: getRaceStationOrderBySlug(row.slug, row.station_order),
    scoreType: row.score_type,
    scoreUnit: row.score_unit,
    isScored: row.is_scored,
    higherIsBetter: row.higher_is_better,
    active: row.active,
  };
}

function heatKey(categoryId: string, heatNumber: number): string {
  return `${categoryId}:${heatNumber}`;
}
