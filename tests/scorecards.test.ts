import { describe, expect, it } from 'vitest';
import { buildJudgeScorecardRows, buildScorecardsForStation, generateScorecardsFromTimeline } from '../src/lib/scorecards.ts';
import { demoStations } from '../src/lib/demo-data.ts';
import { getStationArrivalTime } from '../src/lib/timeline.ts';
import type { Heat, HeatParticipant, JudgeStationAssignment, Participant, Score, Station } from '../src/lib/types.ts';

describe('scorecards utilities', () => {
  it('genera scorecard per stazione, heat e partecipante', () => {
    const scorecards = buildScorecardsForStation({
      eventId: 'event-1',
      station,
      heats,
      heatParticipants,
      participants,
      assignment,
    });

    expect(scorecards).toHaveLength(2);
    expect(scorecards[0]).toMatchObject({
      stationId: 'station-1',
      heatId: 'heat-1',
      participantId: 'p1',
      laneNumber: 1,
      status: 'generated',
    });
  });

  it('rifiuta assignment giudice su stazione diversa', () => {
    expect(() =>
      buildScorecardsForStation({
        eventId: 'event-1',
        station,
        heats,
        heatParticipants,
        participants,
        assignment: { ...assignment, stationId: 'other-station' },
      }),
    ).toThrow('assignment');
  });

  it('costruisce righe giudice filtrate per stazione e ordinate per arrivo stazione, heat, lane e nome', () => {
    const rows = buildJudgeScorecardRows({
      eventId: 'event-1',
      station,
      heats: [
        {
          id: 'heat-2',
          eventId: 'event-1',
          categoryId: 'cat-1',
          heatNumber: 2,
          startsAt: '2026-07-07T08:06:00.000Z',
          endsAt: '2026-07-07T08:12:00.000Z',
          laneCount: 1,
          status: 'scheduled',
        },
        ...heats,
      ],
      heatParticipants: [
        { id: 'hp-3', heatId: 'heat-2', participantId: 'p2', laneNumber: 1 },
        ...heatParticipants,
      ],
      participants,
      assignment,
      scores: [
        score({ participantId: 'p1', stationId: 'station-1', heatId: 'heat-1', rawScore: 12, status: 'validated' }),
        score({ participantId: 'p2', stationId: 'other-station', heatId: 'heat-1', rawScore: 99, status: 'validated' }),
      ],
    });

    expect(rows.map((row) => row.participantName)).toEqual(['Team 1', 'Team 2', 'Team 2']);
    expect(rows[0]).toMatchObject({
      rawScore: 12,
      scoreStatus: 'validated',
      stationArrivalAt: '2026-07-07T08:00:00.000Z',
      stationName: 'Echo Bike',
      teamStartAt: '2026-07-07T08:00:00.000Z',
    });
    expect(rows[1]).toMatchObject({
      rawScore: 0,
      scoreStatus: 'missing',
    });
  });

  it('calcola arrivo stazioni con race station order reale HITRACE60', () => {
    const teamStartTime = '2026-07-07T08:00:00.000Z';

    expect(getStationArrivalTime(teamStartTime, 1)).toBe('2026-07-07T08:00:00.000Z');
    expect(getStationArrivalTime(teamStartTime, 3)).toBe('2026-07-07T08:08:20.000Z');
    expect(getStationArrivalTime(teamStartTime, 5)).toBe('2026-07-07T08:16:40.000Z');
    expect(getStationArrivalTime(teamStartTime, 15)).toBe('2026-07-07T08:58:20.000Z');
  });

  it('genera 8 scorecard da timeline per ogni participant assegnato', () => {
    const rows = generateScorecardsFromTimeline({
      eventId: 'event-1',
      heats,
      heatParticipants: [heatParticipants[0]],
      participants,
      stations: demoStations.map((demoStation) => ({ ...demoStation, eventId: 'event-1' })),
    });

    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({
      participantId: 'p1',
      stationName: 'Echo Bike',
      stationArrivalAt: '2026-07-07T08:00:00.000Z',
      rawScore: 0,
      status: 'missing',
    });
    expect(rows[7]).toMatchObject({
      stationName: 'Yoke Carry',
      stationArrivalAt: '2026-07-07T08:58:20.000Z',
    });
  });
});

const station: Station = {
  id: 'station-1',
  eventId: 'event-1',
  name: 'Echo Bike',
  slug: 'echo-bike',
  stationOrder: 1,
  scoreType: 'numeric',
  scoreUnit: 'cal',
  isScored: true,
  higherIsBetter: true,
  active: true,
};

const heats: Heat[] = [
  {
    id: 'heat-1',
    eventId: 'event-1',
    categoryId: 'cat-1',
    heatNumber: 1,
    startsAt: '2026-07-07T08:00:00.000Z',
    endsAt: '2026-07-07T09:00:00.000Z',
    laneCount: 2,
    status: 'scheduled',
  },
];

const heatParticipants: HeatParticipant[] = [
  { id: 'hp-1', heatId: 'heat-1', participantId: 'p1', laneNumber: 1 },
  { id: 'hp-2', heatId: 'heat-1', participantId: 'p2', laneNumber: 2 },
];

const participants: Participant[] = [
  { id: 'p1', eventId: 'event-1', categoryId: 'cat-1', displayName: 'Team 1', status: 'registered', seedOrder: 1 },
  { id: 'p2', eventId: 'event-1', categoryId: 'cat-1', displayName: 'Team 2', status: 'registered', seedOrder: 2 },
];

const assignment: JudgeStationAssignment = {
  id: 'assignment-1',
  eventId: 'event-1',
  judgeId: 'judge-1',
  stationId: 'station-1',
  tokenHash: 'hash',
  active: true,
};

function score(overrides: Partial<Score>): Score {
  return {
    eventId: 'event-1',
    categoryId: 'cat-1',
    participantId: 'p1',
    stationId: 'station-1',
    heatId: 'heat-1',
    rawScore: 0,
    status: 'submitted',
    ...overrides,
  };
}
