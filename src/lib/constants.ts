import type { CategoryCode, CategoryType } from './types.ts';

export const HITRACE_CATEGORY_DEFINITIONS: Array<{
  code: CategoryCode;
  name: string;
  type: CategoryType;
  teamSize: 1 | 2 | 3;
  startOrder: number;
}> = [
  { code: 'M', name: 'Individual M', type: 'individual', teamSize: 1, startOrder: 1 },
  { code: 'F', name: 'Individual F', type: 'individual', teamSize: 1, startOrder: 2 },
  { code: 'MM', name: 'Team MM', type: 'team_2', teamSize: 2, startOrder: 3 },
  { code: 'MF', name: 'Team MF', type: 'team_2', teamSize: 2, startOrder: 4 },
  { code: 'FF', name: 'Team FF', type: 'team_2', teamSize: 2, startOrder: 5 },
  { code: 'MMM', name: 'Team MMM', type: 'team_3', teamSize: 3, startOrder: 6 },
  { code: 'MMF', name: 'Team MMF', type: 'team_3', teamSize: 3, startOrder: 7 },
];

export const HITRACE_SCORE_STATIONS = [
  {
    name: 'Echo Bike',
    slug: 'echo-bike',
    stationOrder: 1,
    raceStationOrder: 1,
    scoreType: 'numeric',
    scoreUnit: 'cal',
    isScored: true,
    higherIsBetter: true,
  },
  {
    name: 'Farmer Carry',
    slug: 'farmer-carry',
    stationOrder: 2,
    raceStationOrder: 3,
    scoreType: 'numeric',
    scoreUnit: 'reps',
    isScored: true,
    higherIsBetter: true,
  },
  {
    name: 'Rower',
    slug: 'rower',
    stationOrder: 3,
    raceStationOrder: 5,
    scoreType: 'numeric',
    scoreUnit: 'cal',
    isScored: true,
    higherIsBetter: true,
  },
  {
    name: 'Burpees over obstacle',
    slug: 'burpees-over-obstacle',
    stationOrder: 4,
    raceStationOrder: 7,
    scoreType: 'numeric',
    scoreUnit: 'reps',
    isScored: true,
    higherIsBetter: true,
  },
  {
    name: 'Bike Erg',
    slug: 'bike-erg',
    stationOrder: 5,
    raceStationOrder: 9,
    scoreType: 'numeric',
    scoreUnit: 'cal',
    isScored: true,
    higherIsBetter: true,
  },
  {
    name: 'Bear Hug Carry',
    slug: 'bear-hug-carry',
    stationOrder: 6,
    raceStationOrder: 11,
    scoreType: 'numeric',
    scoreUnit: 'reps',
    isScored: true,
    higherIsBetter: true,
  },
  {
    name: 'Ski Erg',
    slug: 'ski-erg',
    stationOrder: 7,
    raceStationOrder: 13,
    scoreType: 'numeric',
    scoreUnit: 'cal',
    isScored: true,
    higherIsBetter: true,
  },
  {
    name: 'Yoke Carry',
    slug: 'yoke-carry',
    stationOrder: 8,
    raceStationOrder: 15,
    scoreType: 'numeric',
    scoreUnit: 'reps',
    isScored: true,
    higherIsBetter: true,
  },
] as const;

export const HITRACE_JUDGE_TOKENS_BY_STATION_SLUG: Record<string, string> = {
  'echo-bike': 'judge-echo-bike-demo-token',
  'farmer-carry': 'judge-farmer-carry-demo-token',
  rower: 'judge-rower-demo-token',
  'burpees-over-obstacle': 'judge-burpees-demo-token',
  'bike-erg': 'judge-bike-erg-demo-token',
  'bear-hug-carry': 'judge-bear-hug-carry-demo-token',
  'ski-erg': 'judge-ski-erg-demo-token',
  'yoke-carry': 'judge-yoke-carry-demo-token',
};

export function getRaceStationOrderBySlug(slug: string, fallbackStationOrder: number): number {
  const station = HITRACE_SCORE_STATIONS.find((stationItem) => stationItem.slug === slug);
  return station?.raceStationOrder ?? fallbackStationOrder * 2 - 1;
}

export const LEADERBOARD_SCORE_STATUSES = ['submitted', 'validated', 'corrected', 'locked'] as const;
export const DISPLAY_LEADERBOARD_SCORE_STATUSES = ['validated', 'corrected'] as const;

export const DEFAULT_EVENT_SETTINGS = {
  laneCount: 6,
  workIntervalSeconds: 240,
  stationTransitionSeconds: 10,
  totalStations: 15,
  pauseAfterCategoryMinutes: 10,
  timezone: 'Europe/Rome',
} as const;
