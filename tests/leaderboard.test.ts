import { describe, expect, it } from 'vitest';
import { calculateLeaderboard } from '../src/lib/leaderboard.ts';
import type { Participant, Score, Station } from '../src/lib/types.ts';

const eventId = 'event-1';
const categoryA = 'cat-a';
const categoryB = 'cat-b';

describe('calculateLeaderboard', () => {
  it('calcola una classifica semplice con totale crescente', () => {
    const result = calculateLeaderboard(
      [score('p1', 's1', 100), score('p2', 's1', 90), score('p3', 's1', 80)],
      participants(['p1', 'p2', 'p3']),
      stations(['s1']),
      categoryA,
    );

    expect(result.map((row) => [row.participantId, row.totalPoints])).toEqual([
      ['p1', 1],
      ['p2', 2],
      ['p3', 3],
    ]);
  });

  it('gestisce pari al primo posto con ranking competitivo 1, 1, 3', () => {
    const result = calculateLeaderboard(
      [score('p1', 's1', 100), score('p2', 's1', 100), score('p3', 's1', 90)],
      participants(['p1', 'p2', 'p3']),
      stations(['s1']),
      categoryA,
    );

    expect(pointsForStation(result)).toEqual({ p1: 1, p2: 1, p3: 3 });
  });

  it('gestisce pari al secondo posto con ranking competitivo 1, 2, 2', () => {
    const result = calculateLeaderboard(
      [score('p1', 's1', 100), score('p2', 's1', 90), score('p3', 's1', 90)],
      participants(['p1', 'p2', 'p3']),
      stations(['s1']),
      categoryA,
    );

    expect(pointsForStation(result)).toEqual({ p1: 1, p2: 2, p3: 2 });
  });

  it('mantiene leggibili gli score mancanti senza assegnare punti', () => {
    const result = calculateLeaderboard(
      [score('p1', 's1', 100)],
      participants(['p1', 'p2']),
      stations(['s1', 's2']),
      categoryA,
    );

    const p2 = result.find((row) => row.participantId === 'p2');
    expect(p2?.totalPoints).toBe(0);
    expect(p2?.completedStations).toBe(0);
    expect(p2?.isComplete).toBe(false);
    expect(p2?.stationResults.every((stationResult) => stationResult.rawScore === null)).toBe(true);
  });

  it('separa categorie multiple', () => {
    const result = calculateLeaderboard(
      [score('p1', 's1', 100, categoryA), score('p2', 's1', 500, categoryB)],
      [
        participant('p1', categoryA),
        participant('p2', categoryB),
      ],
      stations(['s1']),
      categoryA,
    );

    expect(result).toHaveLength(1);
    expect(result[0].participantId).toBe('p1');
  });

  it('somma correttamente lo stesso atleta/team su più stazioni', () => {
    const result = calculateLeaderboard(
      [
        score('p1', 's1', 100),
        score('p2', 's1', 90),
        score('p1', 's2', 40),
        score('p2', 's2', 50),
      ],
      participants(['p1', 'p2']),
      stations(['s1', 's2']),
      categoryA,
    );

    expect(result.map((row) => [row.participantId, row.totalPoints])).toEqual([
      ['p1', 3],
      ['p2', 3],
    ]);
  });

  it('gestisce tutti pari in una stazione', () => {
    const result = calculateLeaderboard(
      [score('p1', 's1', 42), score('p2', 's1', 42), score('p3', 's1', 42)],
      participants(['p1', 'p2', 'p3']),
      stations(['s1']),
      categoryA,
    );

    expect(pointsForStation(result)).toEqual({ p1: 1, p2: 1, p3: 1 });
  });

  it('restituisce array vuoto senza partecipanti', () => {
    expect(calculateLeaderboard([], [], stations(['s1']), categoryA)).toEqual([]);
  });

  it('ignora stazioni non score', () => {
    const result = calculateLeaderboard(
      [score('p1', 's1', 100), score('p1', 'run', 999)],
      participants(['p1']),
      [
        ...stations(['s1']),
        { ...station('run'), name: 'Run', isScored: false },
      ],
      categoryA,
    );

    expect(result[0].requiredStations).toBe(1);
    expect(result[0].totalPoints).toBe(1);
  });
});

function participants(ids: string[]): Participant[] {
  return ids.map((id, index) => participant(id, categoryA, index + 1));
}

function participant(id: string, categoryId = categoryA, seedOrder = 1): Participant {
  return {
    id,
    eventId,
    categoryId,
    displayName: `Team ${id}`,
    status: 'registered',
    seedOrder,
  };
}

function stations(ids: string[]): Station[] {
  return ids.map((id, index) => ({ ...station(id), stationOrder: index + 1 }));
}

function station(id: string): Station {
  return {
    id,
    eventId,
    name: `Station ${id}`,
    slug: id,
    stationOrder: 1,
    scoreType: 'numeric',
    scoreUnit: 'reps',
    isScored: true,
    higherIsBetter: true,
    active: true,
  };
}

function score(participantId: string, stationId: string, rawScore: number, categoryId = categoryA): Score {
  return {
    eventId,
    categoryId,
    participantId,
    stationId,
    heatId: 'heat-1',
    rawScore,
    status: 'submitted',
  };
}

function pointsForStation(rows: ReturnType<typeof calculateLeaderboard>): Record<string, number | null> {
  return Object.fromEntries(rows.map((row) => [row.participantId, row.stationResults[0].rankPoints]));
}
