import { describe, expect, it } from 'vitest';
import { DISPLAY_LEADERBOARD_SCORE_STATUSES, HITRACE_SCORE_STATIONS } from '../src/lib/constants.ts';
import { demoCategories, demoParticipants, demoScores, demoStations } from '../src/lib/demo-data.ts';
import { calculateLeaderboard } from '../src/lib/leaderboard.ts';
import type { Score } from '../src/lib/types.ts';

describe('display leaderboard data', () => {
  it('espone tutte le categorie e le 8 stazioni score', () => {
    expect(demoCategories.map((category) => category.code)).toEqual(['M', 'F', 'MM', 'MF', 'FF', 'MMM', 'MMF']);
    expect(demoStations.map((station) => station.name)).toEqual(HITRACE_SCORE_STATIONS.map((station) => station.name));
  });

  it('usa unita corrette per le 8 stazioni', () => {
    expect(Object.fromEntries(demoStations.map((station) => [station.name, station.scoreUnit]))).toEqual({
      'Bear Hug Carry': 'reps',
      'Bike Erg': 'cal',
      'Burpees over obstacle': 'reps',
      'Echo Bike': 'cal',
      'Farmer Carry': 'reps',
      Rower: 'cal',
      'Ski Erg': 'cal',
      'Yoke Carry': 'reps',
    });
  });

  it('calcola breakdown display con stazioni completate e mancanti', () => {
    const teamMm = demoCategories.find((category) => category.code === 'MM');
    expect(teamMm).toBeDefined();

    const rows = calculateLeaderboard(demoScores, demoParticipants, demoStations, teamMm!.id);
    const partialRow = rows.find((row) => row.participantId === 'team-delta');

    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].stationResults).toHaveLength(8);
    expect(partialRow?.completedStations).toBeLessThan(8);
    expect(partialRow?.stationResults.some((stationResult) => stationResult.rawScore === null)).toBe(true);
  });

  it('display conta solo score validated e corrected', () => {
    const teamMm = demoCategories.find((category) => category.code === 'MM');
    const station = demoStations.find((stationItem) => stationItem.name === 'Echo Bike');
    expect(teamMm).toBeDefined();
    expect(station).toBeDefined();

    const scores: Score[] = [
      score('team-alpha', station!.id, 'draft', 10),
      score('team-bravo', station!.id, 'submitted', 20),
      score('team-charlie', station!.id, 'validated', 30),
      score('team-delta', station!.id, 'corrected', 40),
    ];
    const rows = calculateLeaderboard(scores, demoParticipants, demoStations, teamMm!.id, {
      includedScoreStatuses: [...DISPLAY_LEADERBOARD_SCORE_STATUSES],
    });

    expect(rows.find((row) => row.participantId === 'team-alpha')?.completedStations).toBe(0);
    expect(rows.find((row) => row.participantId === 'team-bravo')?.completedStations).toBe(0);
    expect(rows.find((row) => row.participantId === 'team-charlie')?.completedStations).toBe(1);
    expect(rows.find((row) => row.participantId === 'team-delta')?.completedStations).toBe(1);
  });
});

function score(participantId: string, stationId: string, status: Score['status'], rawScore: number): Score {
  return {
    eventId: 'demo-event',
    categoryId: 'cat-mm',
    participantId,
    stationId,
    heatId: 'heat-cat-mm-1',
    rawScore,
    status,
    updatedAt: '2026-07-07T08:30:00.000Z',
  };
}
