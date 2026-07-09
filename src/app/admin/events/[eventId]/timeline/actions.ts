'use server';

import { revalidatePath } from 'next/cache';
import { getRaceStationOrderBySlug } from '@/lib/constants.ts';
import { resolveSupabaseEventId } from '@/lib/event-id.ts';
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
  heat_number: number;
}

export async function saveTimelineAction(input: SaveTimelineInput): Promise<SaveTimelineResult> {
  if (!hasSupabaseServerConfig()) {
    return { ok: false, message: 'Supabase non configurato: timeline in fallback demo, niente salvataggio.' };
  }

  const eventId = resolveSupabaseEventId(input.eventId);

  if (eventId !== input.eventId) {
    return { ok: false, message: 'Event ID non coerente con la sorgente dati.' };
  }

  if (input.selectedCategoryIds.length === 0) {
    return { ok: false, message: 'Seleziona almeno una categoria.' };
  }

  const supabase = createSupabaseServiceClient();
  const [categoriesResult, participantsResult, stationsResult, assignmentsResult, existingHeatsResult] = await Promise.all([
    supabase
      .from('categories')
      .select('id,event_id,code,name,type,team_size,race_day,start_order')
      .eq('event_id', eventId)
      .in('id', input.selectedCategoryIds),
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
      .select('id,category_id,heat_number')
      .eq('event_id', eventId)
      .in('category_id', input.selectedCategoryIds),
  ]);

  const firstError =
    categoriesResult.error ??
    participantsResult.error ??
    stationsResult.error ??
    assignmentsResult.error ??
    existingHeatsResult.error;

  if (firstError) {
    return { ok: false, message: firstError.message };
  }

  const categories = ((categoriesResult.data ?? []) as CategoryRow[]).map(mapCategory);
  const participants = ((participantsResult.data ?? []) as ParticipantRow[]).map(mapParticipant);
  const stations = ((stationsResult.data ?? []) as StationRow[]).map(mapStation);
  const assignments = (assignmentsResult.data ?? []) as JudgeAssignmentRow[];
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

  if (allHeats.length === 0) {
    return { ok: false, message: 'Nessuna heat generata: verifica partecipanti e categorie.' };
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
  const { error: heatsError } = await supabase.from('heats').upsert(heatRows, { onConflict: 'event_id,category_id,heat_number' });

  if (heatsError) {
    return { ok: false, message: heatsError.message };
  }

  const heatIds = allHeats.map((heat) => heat.id);
  const { error: deleteHeatParticipantsError } = await supabase.from('heat_participants').delete().in('heat_id', heatIds);

  if (deleteHeatParticipantsError) {
    return { ok: false, message: deleteHeatParticipantsError.message };
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
    return { ok: false, message: heatParticipantsError.message };
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
    return { ok: false, message: timelineBlocksError.message };
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
  const { error: scorecardsError } = await supabase
    .from('scorecards')
    .upsert(scorecardRows, { onConflict: 'event_id,station_id,heat_id,participant_id' });

  if (scorecardsError) {
    return { ok: false, message: scorecardsError.message };
  }

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
