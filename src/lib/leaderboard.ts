import { LEADERBOARD_SCORE_STATUSES } from './constants.ts';
import type { LeaderboardRow, Participant, Score, ScoreStatus, Station, StationResult, UUID } from './types.ts';

const inactiveParticipantStatuses = new Set(['withdrawn', 'dnf']);
const defaultIncludedStatuses = new Set<ScoreStatus>(LEADERBOARD_SCORE_STATUSES);

export interface CalculateLeaderboardOptions {
  includedScoreStatuses?: ScoreStatus[];
}

export function calculateLeaderboard(
  scores: Score[],
  participants: Participant[],
  stations: Station[],
  categoryId: UUID,
  options: CalculateLeaderboardOptions = {},
): LeaderboardRow[] {
  const includedStatuses = new Set(options.includedScoreStatuses ?? defaultIncludedStatuses);
  const scoredStations = stations
    .filter((station) => station.active && station.isScored)
    .sort((a, b) => a.stationOrder - b.stationOrder);

  const categoryParticipants = participants
    .filter((participant) => participant.categoryId === categoryId)
    .filter((participant) => !inactiveParticipantStatuses.has(participant.status))
    .sort((a, b) => a.seedOrder - b.seedOrder || a.displayName.localeCompare(b.displayName));

  const participantIds = new Set(categoryParticipants.map((participant) => participant.id));
  const rows = new Map<UUID, LeaderboardRow>();

  for (const participant of categoryParticipants) {
    rows.set(participant.id, {
      participantId: participant.id,
      participantName: participant.displayName,
      categoryId,
      totalPoints: 0,
      stationResults: scoredStations.map((station) => emptyStationResult(station)),
      completedStations: 0,
      requiredStations: scoredStations.length,
      isComplete: false,
    });
  }

  for (const station of scoredStations) {
    const bestScoresByParticipant = selectLatestScoreByParticipant(
      scores.filter((score) => {
        const status = score.status;

        return (
          score.categoryId === categoryId &&
          score.stationId === station.id &&
          participantIds.has(score.participantId) &&
          Number.isFinite(score.rawScore) &&
          (status === undefined || includedStatuses.has(status))
        );
      }),
    );

    const rankedScores = Array.from(bestScoresByParticipant.values()).sort((a, b) => {
      const scoreDelta = station.higherIsBetter ? b.rawScore - a.rawScore : a.rawScore - b.rawScore;

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return a.participantId.localeCompare(b.participantId);
    });

    let previousScore: number | null = null;
    let previousRank = 0;

    rankedScores.forEach((score, index) => {
      const rank = previousScore === score.rawScore ? previousRank : index + 1;
      previousScore = score.rawScore;
      previousRank = rank;

      const row = rows.get(score.participantId);

      if (!row) {
        return;
      }

      const resultIndex = row.stationResults.findIndex((result) => result.stationId === station.id);
      row.stationResults[resultIndex] = {
        stationId: station.id,
        stationName: station.name,
        rawScore: score.rawScore,
        rankPoints: rank,
        rankPosition: rank,
      };
      row.totalPoints += rank;
      row.completedStations += 1;
    });
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      isComplete: row.completedStations === row.requiredStations,
    }))
    .sort((a, b) => {
      if (a.isComplete !== b.isComplete) {
        return a.isComplete ? -1 : 1;
      }

      return (
        a.totalPoints - b.totalPoints ||
        b.completedStations - a.completedStations ||
        a.participantName.localeCompare(b.participantName)
      );
    });
}

function emptyStationResult(station: Station): StationResult {
  return {
    stationId: station.id,
    stationName: station.name,
    rawScore: null,
    rankPoints: null,
    rankPosition: null,
  };
}

function selectLatestScoreByParticipant(scores: Score[]): Map<UUID, Score> {
  const selected = new Map<UUID, Score>();

  for (const score of scores) {
    const previous = selected.get(score.participantId);

    if (!previous || scoreTimestamp(score) >= scoreTimestamp(previous)) {
      selected.set(score.participantId, score);
    }
  }

  return selected;
}

function scoreTimestamp(score: Score): number {
  const value = score.updatedAt ?? score.createdAt;

  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
