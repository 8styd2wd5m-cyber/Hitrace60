import { describe, expect, it } from 'vitest';
import {
  createBreakBlock,
  detectTimelineOverlaps,
  generateHeatsForCategory,
  getScoreStationArrivalSchedule,
} from '../src/lib/timeline.ts';
import type { Participant } from '../src/lib/types.ts';

describe('timeline utilities', () => {
  it('genera start scaglionati per 1 lane e 2 partecipanti', () => {
    const result = generateHeatsForCategory({
      eventId: 'event-1',
      categoryId: 'cat-1',
      participants: participants(2),
      laneCount: 1,
      startsAt: '2026-07-07T08:00:00.000Z',
    });

    expect(result.startSlots).toHaveLength(2);
    expect(result.startSlots[0].startsAt).toBe('2026-07-07T08:00:00.000Z');
    expect(result.startSlots[1].startsAt).toBe('2026-07-07T08:04:10.000Z');
    expect(result.startSlots[0].estimatedFinishAt).toBe('2026-07-07T09:02:20.000Z');
    expect(result.startSlots[1].estimatedFinishAt).toBe('2026-07-07T09:06:30.000Z');
  });

  it('genera 4 lane e 8 partecipanti su due start slot', () => {
    const result = generateHeatsForCategory({
      eventId: 'event-1',
      categoryId: 'cat-1',
      participants: participants(8),
      laneCount: 4,
      startsAt: '2026-07-07T08:00:00.000Z',
    });

    expect(result.startSlots).toHaveLength(2);
    expect(result.startSlots[0].startsAt).toBe('2026-07-07T08:00:00.000Z');
    expect(result.startSlots[0].lanes.map((lane) => lane.participantId)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(result.startSlots[0].lanes.map((lane) => lane.laneNumber)).toEqual([1, 2, 3, 4]);
    expect(result.startSlots[1].startsAt).toBe('2026-07-07T08:04:10.000Z');
    expect(result.startSlots[1].lanes.map((lane) => lane.participantId)).toEqual(['p5', 'p6', 'p7', 'p8']);
  });

  it('calcola durata categoria come ultimo start piu 62:20', () => {
    const result = generateHeatsForCategory({
      eventId: 'event-1',
      categoryId: 'cat-1',
      participants: participants(8),
      laneCount: 4,
      startsAt: '2026-07-07T08:00:00.000Z',
    });

    expect(result.summary?.courseDurationSeconds).toBe(62 * 60 + 20);
    expect(result.summary?.lastStartAt).toBe('2026-07-07T08:04:10.000Z');
    expect(result.summary?.lastFinishAt).toBe('2026-07-07T09:06:30.000Z');
    expect(result.timelineBlocks[0].startsAt).toBe('2026-07-07T08:00:00.000Z');
    expect(result.timelineBlocks[0].endsAt).toBe('2026-07-07T09:06:30.000Z');
  });

  it('rileva overlap considerando occupazione categoria fino a ultimo finish', () => {
    const firstCategory = generateHeatsForCategory({
      eventId: 'event-1',
      categoryId: 'cat-1',
      participants: participants(2, 'cat-1'),
      laneCount: 1,
      startsAt: '2026-07-07T08:00:00.000Z',
    });
    const overlappingCategory = generateHeatsForCategory({
      eventId: 'event-1',
      categoryId: 'cat-2',
      participants: participants(1, 'cat-2'),
      laneCount: 1,
      startsAt: '2026-07-07T08:30:00.000Z',
    });

    expect(detectTimelineOverlaps([...firstCategory.timelineBlocks, ...overlappingCategory.timelineBlocks])).toEqual([
      {
        firstBlockId: 'timeline-category-cat-1',
        secondBlockId: 'timeline-category-cat-2',
      },
    ]);
  });

  it('non rileva overlap se la categoria successiva parte dopo finish piu pausa richiesta', () => {
    const firstCategory = generateHeatsForCategory({
      eventId: 'event-1',
      categoryId: 'cat-1',
      participants: participants(2, 'cat-1'),
      laneCount: 1,
      startsAt: '2026-07-07T08:00:00.000Z',
      pauseAfterCategoryMinutes: 10,
    });
    const nextCategory = generateHeatsForCategory({
      eventId: 'event-1',
      categoryId: 'cat-2',
      participants: participants(1, 'cat-2'),
      laneCount: 1,
      startsAt: '2026-07-07T09:16:30.000Z',
    });

    expect(firstCategory.summary?.lastFinishAt).toBe('2026-07-07T09:06:30.000Z');
    expect(firstCategory.summary?.endsAt).toBe('2026-07-07T09:16:30.000Z');
    expect(detectTimelineOverlaps([...firstCategory.timelineBlocks, ...nextCategory.timelineBlocks])).toEqual([]);
  });

  it('gestisce categoria vuota restituendo liste vuote', () => {
    const result = generateHeatsForCategory({
      eventId: 'event-1',
      categoryId: 'cat-1',
      participants: [],
      laneCount: 4,
      startsAt: '2026-07-07T08:00:00.000Z',
    });

    expect(result.heats).toEqual([]);
    expect(result.timelineBlocks).toEqual([]);
    expect(result.startSlots).toEqual([]);
    expect(result.summary).toBeNull();
  });

  it('blocca lane count non valido', () => {
    expect(() =>
      generateHeatsForCategory({
        eventId: 'event-1',
        categoryId: 'cat-1',
        participants: participants(1),
        laneCount: 0,
        startsAt: '2026-07-07T08:00:00.000Z',
      }),
    ).toThrow('laneCount');
  });

  it('costruisce schedule arrivi per le 8 stazioni score', () => {
    const schedule = getScoreStationArrivalSchedule('2026-07-07T08:00:00.000Z');

    expect(schedule.map((arrival) => [arrival.stationName, arrival.raceStationOrder, arrival.arrivalAt])).toEqual([
      ['Echo Bike', 1, '2026-07-07T08:00:00.000Z'],
      ['Farmer Carry', 3, '2026-07-07T08:08:20.000Z'],
      ['Rower', 5, '2026-07-07T08:16:40.000Z'],
      ['Burpees over obstacle', 7, '2026-07-07T08:25:00.000Z'],
      ['Bike Erg', 9, '2026-07-07T08:33:20.000Z'],
      ['Bear Hug Carry', 11, '2026-07-07T08:41:40.000Z'],
      ['Ski Erg', 13, '2026-07-07T08:50:00.000Z'],
      ['Yoke Carry', 15, '2026-07-07T08:58:20.000Z'],
    ]);
  });

  it('rileva pause manuali sovrapposte al blocco categoria', () => {
    const generated = generateHeatsForCategory({
      eventId: 'event-1',
      categoryId: 'cat-1',
      participants: participants(2),
      laneCount: 1,
      startsAt: '2026-07-07T08:00:00.000Z',
    });
    const breakBlock = createBreakBlock({
      id: 'break-1',
      eventId: 'event-1',
      title: 'Pausa',
      startsAt: '2026-07-07T08:15:00.000Z',
      endsAt: '2026-07-07T08:45:00.000Z',
      sortOrder: 2,
    });

    expect(detectTimelineOverlaps([...generated.timelineBlocks, breakBlock])).toEqual([
      {
        firstBlockId: 'timeline-category-cat-1',
        secondBlockId: 'break-1',
      },
    ]);
  });
});

function participants(count: number, categoryId = 'cat-1'): Participant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    eventId: 'event-1',
    categoryId,
    displayName: `Team ${index + 1}`,
    status: 'registered',
    seedOrder: index + 1,
  }));
}
