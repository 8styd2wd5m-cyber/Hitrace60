import { createHash } from 'node:crypto';
import {
  demoHeatParticipants,
  demoHeats,
  demoParticipants,
  demoStations,
  demoCategories,
  getDemoJudgeAssignments,
} from './demo-data.ts';
import { isDemoFallbackAllowed } from './demo-fallback.ts';
import { buildJudgeScorecardRows } from './scorecards.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from './supabase/server.ts';
import { canJudgeSubmitScores } from './event-status.ts';
import { getRaceStationOrderBySlug } from './constants.ts';
import type {
  Heat,
  HeatParticipant,
  JudgeStationAssignment,
  JudgeStationScorecards,
  Participant,
  ParticipantStatus,
  Score,
  ScoreStatus,
  Station,
  Category,
} from './types.ts';

type SupabaseRelation<T> = T | T[] | null;

export type JudgePageLoadResult =
  | {
      status: 'ready';
      source: 'supabase' | 'demo';
      currentHeatId: string | null;
      stationScorecards: JudgeStationScorecards[];
    }
  | {
      status: 'invalid_token' | 'configuration_error';
      source: 'supabase' | 'demo';
      message: string;
    };

interface AssignmentRow {
  id: string;
  event_id: string;
  judge_id: string;
  station_id: string;
  token_hash: string;
  active: boolean;
  expires_at: string | null;
  judges?: {
    id: string;
    name: string;
    active: boolean;
  }[];
  stations?: SupabaseRelation<StationRow>;
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

interface HeatParticipantRow {
  id: string;
  heat_id: string;
  participant_id: string;
  lane_number: number;
  lane_label: string | null;
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

export async function loadJudgePageData(token: string): Promise<JudgePageLoadResult> {
  if (!hasSupabaseServerConfig()) {
    if (isDemoFallbackAllowed()) {
      return loadDemoJudgePageData(token);
    }

    return {
      status: 'configuration_error',
      source: 'supabase',
      message: 'Configurazione Supabase mancante.',
    };
  }

  return loadSupabaseJudgePageData(token);
}

function loadDemoJudgePageData(token: string): JudgePageLoadResult {
  const assignments = getDemoJudgeAssignments(token);

  if (assignments.length === 0) {
    return {
      status: 'invalid_token',
      source: 'demo',
      message: 'Token giudice non valido',
    };
  }

  const stationScorecards = assignments
    .map((assignment) => {
      const station = demoStations.find((stationItem) => stationItem.id === assignment.stationId);

      if (!station || !station.isScored) {
        return null;
      }

      return {
        assignment,
        station,
        scorecards: buildJudgeScorecardRows({
          eventId: assignment.eventId,
          station,
          categories: demoCategories,
          heats: demoHeats,
          heatParticipants: demoHeatParticipants,
          participants: demoParticipants,
          assignment,
          scores: [],
        }),
      };
    })
    .filter((item): item is JudgeStationScorecards => item !== null);

  if (stationScorecards.length === 0) {
    return {
      status: 'configuration_error',
      source: 'demo',
      message: 'Configurazione giudice incompleta.',
    };
  }

  return {
    status: 'ready',
    source: 'demo',
    currentHeatId: demoHeats.find((heat) => heat.status === 'current')?.id ?? null,
    stationScorecards,
  };
}

async function loadSupabaseJudgePageData(token: string): Promise<JudgePageLoadResult> {
  const supabase = createSupabaseServiceClient();
  const tokenHash = hashJudgeToken(token);

  const { data: assignmentRows, error: assignmentError } = await supabase
    .from('judge_station_assignments')
    .select(
      `
      id,
      event_id,
      judge_id,
      station_id,
      token_hash,
      active,
      expires_at,
      judges:judge_id (
        id,
        name,
        active
      ),
      stations:station_id (
        id,
        event_id,
        name,
        slug,
        station_order,
        score_type,
        score_unit,
        is_scored,
        higher_is_better,
        active
      )
    `,
    )
    .eq('token_hash', tokenHash)
    .eq('active', true);

  if (assignmentError) {
    return {
      status: 'configuration_error',
      source: 'supabase',
      message: assignmentError.message,
    };
  }

  const activeAssignments = ((assignmentRows ?? []) as unknown as AssignmentRow[]).filter((assignment) => {
    const judge = getSingleRelation(assignment.judges);
    const expiresAt = assignment.expires_at ? Date.parse(assignment.expires_at) : null;
    return judge?.active !== false && (!expiresAt || expiresAt > Date.now());
  });

  if (activeAssignments.length === 0) {
    return {
      status: 'invalid_token',
      source: 'supabase',
      message: 'Token giudice non valido',
    };
  }

  const eventId = activeAssignments[0].event_id;
  const stationIds = activeAssignments.map((assignment) => assignment.station_id);
  const { data: eventRow, error: eventError } = await supabase.from('events').select('status').eq('id', eventId).maybeSingle();

  if (eventError || !eventRow) {
    return {
      status: 'configuration_error',
      source: 'supabase',
      message: eventError?.message ?? 'Evento giudice non trovato.',
    };
  }

  if (!canJudgeSubmitScores(eventRow.status)) {
    return {
      status: 'configuration_error',
      source: 'supabase',
      message: eventRow.status === 'completed' || eventRow.status === 'archived' ? 'La gara e conclusa.' : 'La gara non e ancora live.',
    };
  }

  const [
    { data: categoryRows, error: categoriesError },
    { data: heatRows, error: heatsError },
    { data: scoreRows, error: scoresError },
  ] = await Promise.all([
    supabase.from('categories').select('id,event_id,code,name,type,team_size,race_day,start_order').eq('event_id', eventId),
    supabase.from('heats').select('id,event_id,category_id,heat_number,starts_at,ends_at,lane_count,status').eq('event_id', eventId),
    supabase
      .from('scores')
      .select(
        'id,event_id,category_id,participant_id,station_id,heat_id,judge_id,judge_assignment_id,lane_number,raw_score,status,notes,created_at,updated_at',
      )
      .eq('event_id', eventId)
      .in('station_id', stationIds),
  ]);

  if (categoriesError || heatsError || scoresError) {
    return {
      status: 'configuration_error',
      source: 'supabase',
      message: categoriesError?.message ?? heatsError?.message ?? scoresError?.message ?? 'Errore caricamento dati giudice',
    };
  }

  const categories = ((categoryRows ?? []) as CategoryRow[]).map(mapCategoryRow);
  const heats = ((heatRows ?? []) as HeatRow[]).map(mapHeatRow);
  const heatIds = heats.map((heat) => heat.id);

  if (heatIds.length === 0) {
    return {
      status: 'configuration_error',
      source: 'supabase',
      message: 'Nessuna heat configurata per questo evento.',
    };
  }

  const { data: heatParticipantRows, error: heatParticipantsError } = await supabase
    .from('heat_participants')
    .select('id,heat_id,participant_id,lane_number,lane_label')
    .in('heat_id', heatIds);

  if (heatParticipantsError) {
    return {
      status: 'configuration_error',
      source: 'supabase',
      message: heatParticipantsError.message,
    };
  }

  const heatParticipants = ((heatParticipantRows ?? []) as HeatParticipantRow[]).map(mapHeatParticipantRow);
  const participantIds = [...new Set(heatParticipants.map((heatParticipant) => heatParticipant.participantId))];

  if (participantIds.length === 0) {
    return {
      status: 'configuration_error',
      source: 'supabase',
      message: 'Nessun partecipante assegnato alle heat.',
    };
  }

  const { data: participantRows, error: participantsError } = await supabase
    .from('participants')
    .select('id,event_id,category_id,display_name,bib_number,status,seed_order')
    .in('id', participantIds);

  if (participantsError) {
    return {
      status: 'configuration_error',
      source: 'supabase',
      message: participantsError.message,
    };
  }

  const participants = ((participantRows ?? []) as ParticipantRow[]).map(mapParticipantRow);
  const scores = ((scoreRows ?? []) as ScoreRow[]).map(mapScoreRow);
  const stationScorecards = activeAssignments
    .map((assignmentRow) => {
      const stationRow = getSingleRelation(assignmentRow.stations);
      const station = stationRow ? mapStationRow(stationRow) : null;

      if (!station || !station.isScored || !station.active) {
        return null;
      }

      const assignment = mapAssignmentRow(assignmentRow);

      return {
        assignment,
        station,
        scorecards: buildJudgeScorecardRows({
          eventId,
          station,
          categories,
          heats,
          heatParticipants,
          participants,
          assignment,
          scores,
        }),
      };
    })
    .filter((item): item is JudgeStationScorecards => item !== null);

  if (stationScorecards.length === 0) {
    return {
      status: 'configuration_error',
      source: 'supabase',
      message: 'Nessuna stazione score assegnata al giudice.',
    };
  }

  return {
    status: 'ready',
    source: 'supabase',
    currentHeatId: heats.find((heat) => heat.status === 'current')?.id ?? null,
    stationScorecards,
  };
}

export function hashJudgeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function mapAssignmentRow(row: AssignmentRow): JudgeStationAssignment {
  const judge = getSingleRelation(row.judges);

  return {
    id: row.id,
    eventId: row.event_id,
    judgeId: row.judge_id,
    judgeName: judge?.name,
    stationId: row.station_id,
    tokenHash: row.token_hash,
    active: row.active,
    expiresAt: row.expires_at,
  };
}

function getSingleRelation<T>(relation: SupabaseRelation<T> | undefined): T | null {
  if (!relation) {
    return null;
  }

  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

function mapStationRow(row: StationRow): Station {
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

function mapCategoryRow(row: CategoryRow): Category {
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

function mapHeatRow(row: HeatRow): Heat {
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

function mapHeatParticipantRow(row: HeatParticipantRow): HeatParticipant {
  return {
    id: row.id,
    heatId: row.heat_id,
    participantId: row.participant_id,
    laneNumber: row.lane_number,
    laneLabel: row.lane_label,
  };
}

function mapParticipantRow(row: ParticipantRow): Participant {
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

function mapScoreRow(row: ScoreRow): Score {
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
