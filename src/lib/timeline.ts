import type { Heat, HeatParticipant, Participant, TimelineBlock, UUID } from './types.ts';
import { HITRACE_SCORE_STATIONS } from './constants.ts';

export const HITRACE60_WORK_INTERVAL_SECONDS = 4 * 60;
export const HITRACE60_STATION_TRANSITION_SECONDS = 10;
export const HITRACE60_TOTAL_STATIONS = 15;

export interface GenerateHeatsInput {
  eventId: UUID;
  categoryId: UUID;
  participants: Participant[];
  laneCount: number;
  startsAt: string;
  idMode?: 'readable' | 'uuid';
  workIntervalSeconds?: number;
  stationTransitionSeconds?: number;
  totalStations?: number;
  pauseAfterCategoryMinutes?: number;
}

export interface TimelineSlotLane {
  participantId: UUID;
  laneNumber: number;
  laneLabel: string;
  startsAt: string;
  estimatedFinishAt: string;
}

export interface TimelineStartSlot {
  id: UUID;
  heatId: UUID;
  slotNumber: number;
  startsAt: string;
  estimatedFinishAt: string;
  lanes: TimelineSlotLane[];
}

export interface TimelineCategorySummary {
  categoryId: UUID;
  participantCount: number;
  laneCount: number;
  slotCount: number;
  startsAt: string;
  lastStartAt: string;
  lastFinishAt: string;
  endsAt: string;
  workIntervalSeconds: number;
  stationTransitionSeconds: number;
  startIntervalSeconds: number;
  totalStations: number;
  courseDurationSeconds: number;
  pauseAfterCategorySeconds: number;
}

export interface ScoreStationArrival {
  stationName: string;
  stationSlug: string;
  raceStationOrder: number;
  arrivalAt: string;
}

export interface GeneratedTimeline {
  heats: Heat[];
  heatParticipants: HeatParticipant[];
  timelineBlocks: TimelineBlock[];
  startSlots: TimelineStartSlot[];
  summary: TimelineCategorySummary | null;
}

export interface TimelineOverlap {
  firstBlockId: UUID;
  secondBlockId: UUID;
}

export function generateHeatsForCategory(input: GenerateHeatsInput): GeneratedTimeline {
  if (input.laneCount <= 0) {
    throw new Error('laneCount must be greater than zero');
  }

  const workIntervalSeconds = input.workIntervalSeconds ?? HITRACE60_WORK_INTERVAL_SECONDS;
  const stationTransitionSeconds = input.stationTransitionSeconds ?? HITRACE60_STATION_TRANSITION_SECONDS;
  const totalStations = input.totalStations ?? HITRACE60_TOTAL_STATIONS;
  const pauseAfterCategorySeconds = Math.max(0, input.pauseAfterCategoryMinutes ?? 0) * 60;

  if (workIntervalSeconds <= 0) {
    throw new Error('workIntervalSeconds must be greater than zero');
  }

  if (stationTransitionSeconds < 0) {
    throw new Error('stationTransitionSeconds cannot be negative');
  }

  if (totalStations <= 0) {
    throw new Error('totalStations must be greater than zero');
  }

  const sortedParticipants = [...input.participants]
    .filter((participant) => participant.categoryId === input.categoryId)
    .filter((participant) => participant.status !== 'withdrawn' && participant.status !== 'dnf')
    .sort((a, b) => a.seedOrder - b.seedOrder || a.displayName.localeCompare(b.displayName));

  if (sortedParticipants.length === 0) {
    return {
      heats: [],
      heatParticipants: [],
      timelineBlocks: [],
      startSlots: [],
      summary: null,
    };
  }

  const firstStart = Date.parse(input.startsAt);

  if (!Number.isFinite(firstStart)) {
    throw new Error('startsAt must be a valid ISO date');
  }

  const startIntervalSeconds = workIntervalSeconds + stationTransitionSeconds;
  const courseDurationSeconds = totalStations * workIntervalSeconds + (totalStations - 1) * stationTransitionSeconds;
  const heats: Heat[] = [];
  const heatParticipants: HeatParticipant[] = [];
  const startSlots: TimelineStartSlot[] = [];
  const idMode = input.idMode ?? 'readable';

  for (let index = 0; index < sortedParticipants.length; index += input.laneCount) {
    const slotNumber = Math.floor(index / input.laneCount) + 1;
    const heatId =
      idMode === 'uuid'
        ? stableUuidFromString(`heat:${input.eventId}:${input.categoryId}:${slotNumber}`)
        : `heat-${input.categoryId}-${slotNumber}`;
    const startsAt = new Date(firstStart + (slotNumber - 1) * startIntervalSeconds * 1000);
    const estimatedFinishAt = new Date(startsAt.getTime() + courseDurationSeconds * 1000);
    const slotParticipants = sortedParticipants.slice(index, index + input.laneCount);
    const lanes = slotParticipants.map((participant, laneIndex) => {
      const laneNumber = laneIndex + 1;
      const laneLabel = `Lane ${laneNumber}`;

      heatParticipants.push({
        id:
          idMode === 'uuid'
            ? stableUuidFromString(`heat-participant:${input.eventId}:${heatId}:${participant.id}:${laneNumber}`)
            : `heat-participant-${heatId}-${laneNumber}`,
        heatId,
        participantId: participant.id,
        laneNumber,
        laneLabel,
      });

      return {
        participantId: participant.id,
        laneNumber,
        laneLabel,
        startsAt: startsAt.toISOString(),
        estimatedFinishAt: estimatedFinishAt.toISOString(),
      };
    });

    heats.push({
      id: heatId,
      eventId: input.eventId,
      categoryId: input.categoryId,
      heatNumber: slotNumber,
      startsAt: startsAt.toISOString(),
      endsAt: estimatedFinishAt.toISOString(),
      laneCount: input.laneCount,
      status: 'scheduled',
    });

    startSlots.push({
      id:
        idMode === 'uuid'
          ? stableUuidFromString(`slot:${input.eventId}:${input.categoryId}:${slotNumber}`)
          : `slot-${input.categoryId}-${slotNumber}`,
      heatId,
      slotNumber,
      startsAt: startsAt.toISOString(),
      estimatedFinishAt: estimatedFinishAt.toISOString(),
      lanes,
    });
  }

  const lastSlot = startSlots[startSlots.length - 1];
  const lastFinish = Date.parse(lastSlot.estimatedFinishAt);
  const categoryEndsAt = new Date(lastFinish + pauseAfterCategorySeconds * 1000).toISOString();
  const timelineBlocks: TimelineBlock[] = [
    {
      id:
        idMode === 'uuid'
          ? stableUuidFromString(`timeline-category:${input.eventId}:${input.categoryId}`)
          : `timeline-category-${input.categoryId}`,
      eventId: input.eventId,
      categoryId: input.categoryId,
      blockType: 'heat',
      title: 'Start scaglionati categoria',
      startsAt: new Date(firstStart).toISOString(),
      endsAt: categoryEndsAt,
      sortOrder: 1,
      notes:
        pauseAfterCategorySeconds > 0
          ? `Occupazione categoria fino a ultimo finish + pausa ${formatDuration(pauseAfterCategorySeconds)}`
          : 'Occupazione categoria fino a ultimo finish',
    },
  ];

  return {
    heats,
    heatParticipants,
    timelineBlocks,
    startSlots,
    summary: {
      categoryId: input.categoryId,
      participantCount: sortedParticipants.length,
      laneCount: input.laneCount,
      slotCount: startSlots.length,
      startsAt: new Date(firstStart).toISOString(),
      lastStartAt: lastSlot.startsAt,
      lastFinishAt: lastSlot.estimatedFinishAt,
      endsAt: categoryEndsAt,
      workIntervalSeconds,
      stationTransitionSeconds,
      startIntervalSeconds,
      totalStations,
      courseDurationSeconds,
      pauseAfterCategorySeconds,
    },
  };
}

export function createBreakBlock(input: {
  id: UUID;
  eventId: UUID;
  title: string;
  startsAt: string;
  endsAt: string;
  sortOrder: number;
  categoryId?: UUID | null;
}): TimelineBlock {
  assertValidDateRange(input.startsAt, input.endsAt);

  return {
    id: input.id,
    eventId: input.eventId,
    categoryId: input.categoryId ?? null,
    blockType: 'break',
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    sortOrder: input.sortOrder,
  };
}

export function detectTimelineOverlaps(blocks: TimelineBlock[]): TimelineOverlap[] {
  const sortedBlocks = [...blocks].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const overlaps: TimelineOverlap[] = [];

  for (let index = 0; index < sortedBlocks.length - 1; index += 1) {
    const current = sortedBlocks[index];
    const next = sortedBlocks[index + 1];

    assertValidDateRange(current.startsAt, current.endsAt);
    assertValidDateRange(next.startsAt, next.endsAt);

    if (Date.parse(current.endsAt) > Date.parse(next.startsAt)) {
      overlaps.push({
        firstBlockId: current.id,
        secondBlockId: next.id,
      });
    }
  }

  return overlaps;
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export function stableUuidFromString(value: string): UUID {
  const hex = [0, 1, 2, 3].map((salt) => hash32(`${salt}:${value}`).toString(16).padStart(8, '0')).join('');
  const version = `5${hex.slice(13, 16)}`;
  const variant = `${((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`;

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${version}-${variant}-${hex.slice(20, 32)}`;
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function getStationArrivalTime(
  teamStartTime: string,
  raceStationOrder: number,
  startIntervalSeconds = HITRACE60_WORK_INTERVAL_SECONDS + HITRACE60_STATION_TRANSITION_SECONDS,
): string {
  const start = Date.parse(teamStartTime);

  if (!Number.isFinite(start)) {
    throw new Error('teamStartTime must be a valid ISO date');
  }

  if (!Number.isInteger(raceStationOrder) || raceStationOrder <= 0) {
    throw new Error('raceStationOrder must be a positive integer');
  }

  return new Date(start + (raceStationOrder - 1) * startIntervalSeconds * 1000).toISOString();
}

export function getScoreStationArrivalSchedule(teamStartTime: string): ScoreStationArrival[] {
  return HITRACE_SCORE_STATIONS.map((station) => ({
    stationName: station.name,
    stationSlug: station.slug,
    raceStationOrder: station.raceStationOrder,
    arrivalAt: getStationArrivalTime(teamStartTime, station.raceStationOrder),
  }));
}

function assertValidDateRange(startsAt: string, endsAt: string): void {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error('Timeline dates must be valid ISO dates');
  }

  if (end <= start) {
    throw new Error('Timeline block end must be after start');
  }
}
