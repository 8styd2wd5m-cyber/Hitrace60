import { DISPLAY_LEADERBOARD_SCORE_STATUSES, getRaceStationOrderBySlug } from './constants.ts';
import { demoCategories, demoHeats, demoParticipants, demoStations } from './demo-data.ts';
import { resolveSupabaseEventId } from './event-id.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from './supabase/server.ts';
import type { Category, Heat, Participant, ParticipantStatus, Score, ScoreStatus, Station } from './types.ts';

export interface DisplayPageData {
  categories: Category[];
  heats: Heat[];
  participants: Participant[];
  scores: Score[];
  source: 'supabase' | 'demo';
  stations: Station[];
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

interface ParticipantRow {
  id: string;
  event_id: string;
  category_id: string;
  display_name: string;
  bib_number: string | null;
  status: ParticipantStatus;
  seed_order: number;
}

interface HeatRow {
  id: string;
  event_id: string;
  category_id: string;
  heat_number: number;
  starts_at: string;
  ends_at: string;
  lane_count: number;
  status: Heat['status'];
}

interface ScoreRow {
  id: string;
  event_id: string;
  category_id: string;
  participant_id: string;
  station_id: string;
  heat_id: string;
  judge_id: string | null;
  judge_assignment_id: string | null;
  lane_number: number | null;
  raw_score: number | string;
  status: ScoreStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function loadDisplayPageData(eventId: string): Promise<DisplayPageData> {
  if (!hasSupabaseServerConfig()) {
    return {
      categories: demoCategories.filter((category) => category.eventId === eventId),
      heats: demoHeats.filter((heat) => heat.eventId === eventId),
      participants: demoParticipants.filter((participant) => participant.eventId === eventId),
      scores: [],
      source: 'demo',
      stations: demoStations.filter((station) => station.eventId === eventId),
    };
  }

  const supabase = createSupabaseServiceClient();
  const resolvedEventId = resolveSupabaseEventId(eventId);
  const [categoriesResult, stationsResult, participantsResult, heatsResult, scoresResult] = await Promise.all([
    supabase.from('categories').select('id,event_id,code,name,type,team_size,race_day,start_order').eq('event_id', resolvedEventId),
    supabase
      .from('stations')
      .select('id,event_id,name,slug,station_order,score_type,score_unit,is_scored,higher_is_better,active')
      .eq('event_id', resolvedEventId),
    supabase
      .from('participants')
      .select('id,event_id,category_id,display_name,bib_number,status,seed_order')
      .eq('event_id', resolvedEventId),
    supabase
      .from('heats')
      .select('id,event_id,category_id,heat_number,starts_at,ends_at,lane_count,status')
      .eq('event_id', resolvedEventId),
    supabase
      .from('scores')
      .select(
        'id,event_id,category_id,participant_id,station_id,heat_id,judge_id,judge_assignment_id,lane_number,raw_score,status,notes,created_at,updated_at',
      )
      .eq('event_id', resolvedEventId)
      .in('status', [...DISPLAY_LEADERBOARD_SCORE_STATUSES]),
  ]);

  const firstError =
    categoriesResult.error ?? stationsResult.error ?? participantsResult.error ?? heatsResult.error ?? scoresResult.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    categories: ((categoriesResult.data ?? []) as CategoryRow[]).map(mapCategory),
    heats: ((heatsResult.data ?? []) as HeatRow[]).map(mapHeat),
    participants: ((participantsResult.data ?? []) as ParticipantRow[]).map(mapParticipant),
    scores: ((scoresResult.data ?? []) as ScoreRow[]).map(mapScore),
    source: 'supabase',
    stations: ((stationsResult.data ?? []) as StationRow[]).map(mapStation),
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

function mapHeat(row: HeatRow): Heat {
  return {
    id: row.id,
    eventId: row.event_id,
    categoryId: row.category_id,
    heatNumber: row.heat_number,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    laneCount: row.lane_count,
    status: row.status,
  };
}

function mapScore(row: ScoreRow): Score {
  return {
    id: row.id,
    eventId: row.event_id,
    categoryId: row.category_id,
    participantId: row.participant_id,
    stationId: row.station_id,
    heatId: row.heat_id,
    judgeId: row.judge_id,
    judgeAssignmentId: row.judge_assignment_id,
    laneNumber: row.lane_number,
    rawScore: Number(row.raw_score),
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
