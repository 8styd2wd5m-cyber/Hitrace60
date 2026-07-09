import type {
  Heat,
  HeatParticipant,
  JudgeScorecardRow,
  JudgeStationAssignment,
  Participant,
  Score,
  Scorecard,
  Station,
  Category,
} from './types.ts';
import { getStationArrivalTime } from './timeline.ts';

export interface BuildScorecardsInput {
  eventId: string;
  station: Station;
  heats: Heat[];
  heatParticipants: HeatParticipant[];
  participants: Participant[];
  assignment: JudgeStationAssignment;
}

export interface TimelineGeneratedScorecard {
  eventId: string;
  categoryId: string;
  participantId: string;
  heatId: string;
  laneNumber: number;
  laneLabel?: string | null;
  stationId: string;
  stationName: string;
  raceStationOrder: number;
  teamStartAt: string;
  stationArrivalAt: string;
  rawScore: number;
  status: 'missing';
}

export function generateScorecardsFromTimeline(input: {
  eventId: string;
  heats: Heat[];
  heatParticipants: HeatParticipant[];
  participants: Participant[];
  stations: Station[];
}): TimelineGeneratedScorecard[] {
  const participantById = new Map(input.participants.map((participant) => [participant.id, participant]));
  const stations = input.stations
    .filter((station) => station.active && station.isScored)
    .sort((a, b) => a.stationOrder - b.stationOrder);
  const lanesByHeatId = new Map<string, HeatParticipant[]>();

  for (const lane of input.heatParticipants) {
    const lanes = lanesByHeatId.get(lane.heatId) ?? [];
    lanes.push(lane);
    lanesByHeatId.set(lane.heatId, lanes);
  }

  return input.heats
    .filter((heat) => heat.eventId === input.eventId)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.heatNumber - b.heatNumber)
    .flatMap((heat) =>
      [...(lanesByHeatId.get(heat.id) ?? [])]
        .sort((a, b) => a.laneNumber - b.laneNumber)
        .flatMap((lane) => {
          const participant = participantById.get(lane.participantId);

          if (!participant) {
            return [];
          }

          return stations.map((station) => {
            const raceStationOrder = station.raceStationOrder ?? station.stationOrder * 2 - 1;

            return {
              eventId: input.eventId,
              categoryId: participant.categoryId,
              participantId: participant.id,
              heatId: heat.id,
              laneNumber: lane.laneNumber,
              laneLabel: lane.laneLabel,
              stationId: station.id,
              stationName: station.name,
              raceStationOrder,
              teamStartAt: heat.startsAt,
              stationArrivalAt: getStationArrivalTime(heat.startsAt, raceStationOrder),
              rawScore: 0,
              status: 'missing' as const,
            };
          });
        }),
    );
}

export function buildScorecardsForStation(input: BuildScorecardsInput): Scorecard[] {
  if (input.assignment.eventId !== input.eventId || input.assignment.stationId !== input.station.id) {
    throw new Error('Judge assignment does not match scorecard station');
  }

  const participantIds = new Set(input.participants.map((participant) => participant.id));

  return input.heats
    .filter((heat) => heat.eventId === input.eventId)
    .flatMap((heat) =>
      input.heatParticipants
        .filter((heatParticipant) => heatParticipant.heatId === heat.id)
        .filter((heatParticipant) => participantIds.has(heatParticipant.participantId))
        .sort((a, b) => a.laneNumber - b.laneNumber)
        .map((heatParticipant) => ({
          id: `scorecard-${input.assignment.id}-${input.station.id}-${heat.id}-${heatParticipant.participantId}`,
          eventId: input.eventId,
          judgeAssignmentId: input.assignment.id,
          stationId: input.station.id,
          heatId: heat.id,
          participantId: heatParticipant.participantId,
          laneNumber: heatParticipant.laneNumber,
          status: 'generated' as const,
        })),
    );
}

export interface BuildJudgeScorecardRowsInput extends BuildScorecardsInput {
  categories?: Category[];
  scores: Score[];
}

export function buildJudgeScorecardRows(input: BuildJudgeScorecardRowsInput): JudgeScorecardRow[] {
  const scorecards = buildScorecardsForStation(input);
  const categoryById = new Map((input.categories ?? []).map((category) => [category.id, category]));
  const participantById = new Map(input.participants.map((participant) => [participant.id, participant]));
  const heatById = new Map(input.heats.map((heat) => [heat.id, heat]));

  const rows: JudgeScorecardRow[] = [];

  for (const scorecard of scorecards) {
    const participant = participantById.get(scorecard.participantId);
    const heat = heatById.get(scorecard.heatId);

    if (!participant || !heat) {
      continue;
    }

    const existingScore = input.scores.find(
      (score) =>
        score.eventId === input.eventId &&
        score.stationId === input.station.id &&
        score.heatId === heat.id &&
        score.participantId === participant.id,
    );

    const heatParticipant = input.heatParticipants.find(
      (entry) => entry.heatId === heat.id && entry.participantId === participant.id,
    );
    const raceStationOrder = input.station.raceStationOrder ?? input.station.stationOrder * 2 - 1;
    const stationArrivalAt = getStationArrivalTime(heat.startsAt, raceStationOrder);

    rows.push({
      id: scorecard.id,
      eventId: scorecard.eventId,
      judgeAssignmentId: scorecard.judgeAssignmentId,
      stationId: scorecard.stationId,
      stationName: input.station.name,
      heatId: scorecard.heatId,
      heatNumber: heat.heatNumber,
      heatStartsAt: heat.startsAt,
      teamStartAt: heat.startsAt,
      stationArrivalAt,
      raceStationOrder,
      participantId: scorecard.participantId,
      participantName: participant.displayName,
      categoryId: participant.categoryId,
      categoryName: categoryById.get(participant.categoryId)?.name ?? participant.categoryId,
      laneNumber: scorecard.laneNumber,
      laneLabel: heatParticipant?.laneLabel,
      scoreUnit: input.station.scoreUnit,
      scoreId: existingScore?.id ?? null,
      rawScore: existingScore?.rawScore ?? 0,
      scoreStatus: existingScore?.status ?? 'missing',
    });
  }

  return rows.sort((a, b) => {
      const arrivalDiff = Date.parse(a.stationArrivalAt) - Date.parse(b.stationArrivalAt);
      if (arrivalDiff !== 0) return arrivalDiff;

      const heatNumberDiff = a.heatNumber - b.heatNumber;
      if (heatNumberDiff !== 0) return heatNumberDiff;

      const laneDiff = a.laneNumber - b.laneNumber;
      if (laneDiff !== 0) return laneDiff;

      return a.participantName.localeCompare(b.participantName);
    });
}
