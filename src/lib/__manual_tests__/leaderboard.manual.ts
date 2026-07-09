import { calculateLeaderboard } from '../leaderboard.ts';
import type { Participant, Score, Station } from '../types.ts';

const categoryId = 'cat-mm';
const eventId = 'event-demo';

const participants: Participant[] = [
  {
    id: 'team-a',
    eventId,
    categoryId,
    displayName: 'Team A',
    status: 'registered',
    seedOrder: 1,
  },
  {
    id: 'team-b',
    eventId,
    categoryId,
    displayName: 'Team B',
    status: 'registered',
    seedOrder: 2,
  },
  {
    id: 'team-c',
    eventId,
    categoryId,
    displayName: 'Team C',
    status: 'registered',
    seedOrder: 3,
  },
];

const stations: Station[] = [
  {
    id: 'echo-bike',
    eventId,
    name: 'Echo Bike',
    slug: 'echo-bike',
    stationOrder: 1,
    scoreType: 'numeric',
    scoreUnit: 'cal',
    isScored: true,
    higherIsBetter: true,
    active: true,
  },
  {
    id: 'rower',
    eventId,
    name: 'Rower',
    slug: 'rower',
    stationOrder: 2,
    scoreType: 'numeric',
    scoreUnit: 'm',
    isScored: true,
    higherIsBetter: true,
    active: true,
  },
];

const scores: Score[] = [
  score('team-a', 'echo-bike', 100),
  score('team-b', 'echo-bike', 100),
  score('team-c', 'echo-bike', 90),
  score('team-a', 'rower', 80),
  score('team-b', 'rower', 70),
  score('team-c', 'rower', 80),
];

const leaderboard = calculateLeaderboard(scores, participants, stations, categoryId);

assertEqual(
  leaderboard.map((row) => ({
    id: row.participantId,
    points: row.totalPoints,
    ranks: row.stationResults.map((result) => result.rankPoints),
  })),
  [
    { id: 'team-a', points: 2, ranks: [1, 1] },
    { id: 'team-b', points: 4, ranks: [1, 3] },
    { id: 'team-c', points: 4, ranks: [3, 1] },
  ],
);

console.log('Leaderboard manual test passed');

function score(participantId: string, stationId: string, rawScore: number): Score {
  return {
    eventId,
    categoryId,
    participantId,
    stationId,
    heatId: 'heat-1',
    rawScore,
    status: 'submitted',
    updatedAt: '2026-07-07T10:00:00.000Z',
  };
}

function assertEqual(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    console.error('Actual:', actualJson);
    console.error('Expected:', expectedJson);
    throw new Error('Assertion failed');
  }
}
