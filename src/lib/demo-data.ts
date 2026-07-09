import { HITRACE_CATEGORY_DEFINITIONS, HITRACE_JUDGE_TOKENS_BY_STATION_SLUG, HITRACE_SCORE_STATIONS } from './constants.ts';
import type {
  Category,
  Heat,
  HeatParticipant,
  JudgeStationAssignment,
  Participant,
  ParticipantMember,
  Score,
  Station,
} from './types.ts';

export const DEMO_EVENT_ID = 'demo-event';
export const DEMO_JUDGE_TOKEN = 'demo-echo-bike';
export const DEMO_SEEDED_JUDGE_TOKEN = 'judge-echo-bike-demo-token';
export const DEMO_MULTI_STATION_JUDGE_TOKEN = 'demo-multi-station';

export const demoCategories: Category[] = HITRACE_CATEGORY_DEFINITIONS.map((category) => ({
  id: `cat-${category.code.toLowerCase()}`,
  eventId: DEMO_EVENT_ID,
  code: category.code,
  name: category.name,
  type: category.type,
  teamSize: category.teamSize,
  raceDay: '2026-07-07',
  startOrder: category.startOrder,
}));

export const demoStations: Station[] = HITRACE_SCORE_STATIONS.map((station) => ({
  id: `station-${station.slug}`,
  eventId: DEMO_EVENT_ID,
  name: station.name,
  slug: station.slug,
  stationOrder: station.stationOrder,
  raceStationOrder: station.raceStationOrder,
  scoreType: station.scoreType,
  scoreUnit: station.scoreUnit,
  isScored: station.isScored,
  higherIsBetter: station.higherIsBetter,
  active: true,
}));

export const demoParticipants: Participant[] = [
  participant('athlete-mario', 'cat-m', 'Mario Neri', 1),
  participant('athlete-luca', 'cat-m', 'Luca Bianchi', 2),
  participant('athlete-anna', 'cat-f', 'Anna Rossi', 1),
  participant('athlete-bianca', 'cat-f', 'Bianca Verdi', 2),
  participant('team-alpha', 'cat-mm', 'Team Alpha', 1),
  participant('team-bravo', 'cat-mm', 'Team Bravo', 2),
  participant('team-charlie', 'cat-mm', 'Team Charlie con nome lungo da megaschermo', 3),
  participant('team-delta', 'cat-mm', 'Team Delta', 4),
  participant('team-mix-uno', 'cat-mf', 'Team Mix Uno', 1),
  participant('team-mix-due', 'cat-mf', 'Team Mix Due', 2),
  participant('team-ff-uno', 'cat-ff', 'Team FF Uno', 1),
  participant('team-ff-due', 'cat-ff', 'Team FF Due', 2),
  participant('team-triple-uno', 'cat-mmm', 'Team Triple Uno', 1),
  participant('team-triple-due', 'cat-mmm', 'Team Triple Due', 2),
  participant('team-mmf-uno', 'cat-mmf', 'Team MMF Uno', 1),
  participant('team-mmf-due', 'cat-mmf', 'Team MMF Due', 2),
];

export const demoParticipantMembers: ParticipantMember[] = [
  member('member-alpha-1', 'team-alpha', 'Marco', 'Alpha', 'M', 1),
  member('member-alpha-2', 'team-alpha', 'Luca', 'Alpha', 'M', 2),
  member('member-bravo-1', 'team-bravo', 'Paolo', 'Bravo', 'M', 1),
  member('member-bravo-2', 'team-bravo', 'Giorgio', 'Bravo', 'M', 2),
  member('member-charlie-1', 'team-charlie', 'Andrea', 'Charlie', 'M', 1),
  member('member-charlie-2', 'team-charlie', 'Matteo', 'Charlie', 'M', 2),
  member('member-delta-1', 'team-delta', 'Davide', 'Delta', 'M', 1),
  member('member-delta-2', 'team-delta', 'Simone', 'Delta', 'M', 2),
  member('member-anna-1', 'athlete-anna', 'Anna', 'Rossi', 'F', 1),
  member('member-bianca-1', 'athlete-bianca', 'Bianca', 'Verdi', 'F', 1),
];

export const demoHeats: Heat[] = [
  {
    id: 'heat-cat-mm-1',
    eventId: DEMO_EVENT_ID,
    categoryId: 'cat-mm',
    heatNumber: 1,
    startsAt: '2026-07-07T08:00:00.000Z',
    endsAt: '2026-07-07T09:00:00.000Z',
    laneCount: 4,
    status: 'current',
  },
];

export const demoHeatParticipants: HeatParticipant[] = demoParticipants
  .filter((participantItem) => participantItem.categoryId === 'cat-mm')
  .map((participantItem, index) => ({
    id: `heat-participant-${participantItem.id}`,
    heatId: 'heat-cat-mm-1',
    participantId: participantItem.id,
    laneNumber: index + 1,
    laneLabel: `Lane ${index + 1}`,
  }));

export const demoJudgeAssignment: JudgeStationAssignment = {
  id: 'assignment-echo-bike',
  eventId: DEMO_EVENT_ID,
  judgeId: 'judge-echo',
  judgeName: 'Giudice Echo Bike',
  stationId: 'station-echo-bike',
  tokenHash: 'demo-token-hash',
  active: true,
  expiresAt: '2026-12-31T23:59:59.000Z',
};

export const demoJudgeAssignments: JudgeStationAssignment[] = demoStations.map((station) => ({
  id: `assignment-${station.slug}`,
  eventId: DEMO_EVENT_ID,
  judgeId: `judge-${station.slug}`,
  judgeName: `Giudice ${station.name}`,
  stationId: station.id,
  tokenHash: `demo-token-hash-${station.slug}`,
  active: true,
  expiresAt: '2026-12-31T23:59:59.000Z',
}));

export const demoMultiStationJudgeAssignments: JudgeStationAssignment[] = [
  demoJudgeAssignments.find((assignment) => assignment.stationId === 'station-echo-bike') ?? demoJudgeAssignment,
  demoJudgeAssignments.find((assignment) => assignment.stationId === 'station-rower') ?? {
    ...demoJudgeAssignment,
    id: 'assignment-rower-extra',
    stationId: 'station-rower',
  },
];

export const demoScores: Score[] = [
  ...scoreSeries('team-alpha', 'cat-mm', [100, 62, 810, 45, 950, 70, 720, 55]),
  ...scoreSeries('team-bravo', 'cat-mm', [100, 58, 760, 48, 980, 68, 700, 52]),
  ...scoreSeries('team-charlie', 'cat-mm', [90, 60, 810, 43, 910, 72, 710]),
  ...scoreSeries('team-delta', 'cat-mm', [75, 55, 720, 40]),
  ...scoreSeries('athlete-mario', 'cat-m', [82, 48, 680, 39, 820, 52]),
  ...scoreSeries('athlete-luca', 'cat-m', [86, 46, 710, 37, 800]),
  ...scoreSeries('athlete-anna', 'cat-f', [70, 39, 610, 33, 760, 44]),
  ...scoreSeries('athlete-bianca', 'cat-f', [72, 41, 590, 34]),
  ...scoreSeries('team-mix-uno', 'cat-mf', [88, 51, 730, 42, 870]),
  ...scoreSeries('team-mix-due', 'cat-mf', [84, 53, 720, 40]),
  ...scoreSeries('team-ff-uno', 'cat-ff', [76, 44, 640, 36]),
  ...scoreSeries('team-ff-due', 'cat-ff', [78, 43, 650]),
  ...scoreSeries('team-triple-uno', 'cat-mmm', [118, 72, 920, 56, 1080]),
  ...scoreSeries('team-triple-due', 'cat-mmm', [112, 69, 900, 54]),
  ...scoreSeries('team-mmf-uno', 'cat-mmf', [110, 66, 880, 52]),
  ...scoreSeries('team-mmf-due', 'cat-mmf', [106, 68, 860]),
];

export function getDemoCategory(categoryId: string): Category | undefined {
  return demoCategories.find((category) => category.id === categoryId);
}

export function getDemoJudgeAssignment(token: string): JudgeStationAssignment | null {
  const assignments = getDemoJudgeAssignments(token);
  return assignments.length === 1 ? assignments[0] : null;
}

export function getDemoJudgeAssignments(token: string): JudgeStationAssignment[] {
  if (token === DEMO_JUDGE_TOKEN || token === DEMO_SEEDED_JUDGE_TOKEN) {
    return [demoJudgeAssignments.find((assignment) => assignment.stationId === 'station-echo-bike') ?? demoJudgeAssignment];
  }

  if (token === DEMO_MULTI_STATION_JUDGE_TOKEN) {
    return demoMultiStationJudgeAssignments;
  }

  const stationSlug = Object.entries(HITRACE_JUDGE_TOKENS_BY_STATION_SLUG).find(([, stationToken]) => stationToken === token)?.[0];
  const assignment = stationSlug
    ? demoJudgeAssignments.find((candidate) => candidate.stationId === `station-${stationSlug}`)
    : undefined;

  if (assignment) {
    return [assignment];
  }

  if (token.startsWith('demo-')) {
    const legacySlug = token.replace(/^demo-/, '');
    const legacyAssignment = demoJudgeAssignments.find((candidate) => candidate.stationId === `station-${legacySlug}`);

    if (legacyAssignment) {
      return [legacyAssignment];
    }
  }

  return [];
}

function participant(id: string, categoryId: string, displayName: string, seedOrder: number): Participant {
  return {
    id,
    eventId: DEMO_EVENT_ID,
    categoryId,
    displayName,
    status: 'registered',
    seedOrder,
  };
}

function member(
  id: string,
  participantId: string,
  firstName: string,
  lastName: string,
  gender: 'M' | 'F',
  memberOrder: number,
): ParticipantMember {
  return {
    id,
    participantId,
    firstName,
    lastName,
    gender,
    memberOrder,
  };
}

function score(participantId: string, stationId: string, rawScore: number, categoryId = 'cat-mm'): Score {
  return {
    id: `score-${participantId}-${stationId}`,
    eventId: DEMO_EVENT_ID,
    categoryId,
    participantId,
    stationId,
    heatId: categoryId === 'cat-mm' ? 'heat-cat-mm-1' : 'heat-cat-f-1',
    rawScore,
    status: 'submitted',
    updatedAt: '2026-07-07T08:30:00.000Z',
  };
}

function scoreSeries(participantId: string, categoryId: string, rawScores: number[]): Score[] {
  return rawScores.map((rawScore, index) => score(participantId, demoStations[index].id, rawScore, categoryId));
}
