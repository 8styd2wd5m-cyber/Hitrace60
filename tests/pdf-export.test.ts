import { describe, expect, it } from 'vitest';
import { buildTimelinePdfRows, paginatePdfRows, sanitizePdfText } from '../src/lib/pdf.ts';
import type { Category, Heat, HeatParticipant, Participant } from '../src/lib/types.ts';

describe('pdf export helpers', () => {
  it('pagina molti partecipanti in modo stampabile', () => {
    const rows = Array.from({ length: 53 }, (_, index) => ({ id: index + 1 }));
    const pages = paginatePdfRows(rows, 20);

    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.rows.length)).toEqual([20, 20, 13]);
  });

  it('mantiene una pagina vuota per export senza righe', () => {
    expect(paginatePdfRows([], 20)).toEqual([{ pageNumber: 1, rows: [] }]);
  });

  it('tronca nomi team molto lunghi per layout PDF', () => {
    const value = sanitizePdfText('Team con un nome veramente molto molto molto lungo che rompe il layout', 24);

    expect(value).toBe('Team con un nome verame…');
  });

  it('rifiuta rowsPerPage non valido', () => {
    expect(() => paginatePdfRows([1], 0)).toThrow('rowsPerPage');
  });

  it('costruisce righe timeline PDF ordinate e stampabili', () => {
    const rows = buildTimelinePdfRows({
      categories,
      heats,
      heatParticipants,
      participants,
      startIntervalSeconds: 250,
      courseDurationSeconds: 3740,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        categoryName: 'Team MM',
        slotNumber: 1,
        laneLabel: 'Lane 1',
        participantName: 'Team Alpha',
        estimatedFinishAt: '2026-07-07T09:02:20.000Z',
        notes: 'Start ogni 4:10 · Percorso 1:02:20',
      }),
      expect.objectContaining({
        categoryName: 'Team MM',
        slotNumber: 1,
        laneLabel: 'Lane 2',
        participantName: 'Team Bravo',
      }),
    ]);
  });
});

const categories: Category[] = [
  {
    id: 'cat-mm',
    eventId: 'event-1',
    code: 'MM',
    name: 'Team MM',
    type: 'team_2',
    teamSize: 2,
    startOrder: 1,
  },
];

const heats: Heat[] = [
  {
    id: 'heat-1',
    eventId: 'event-1',
    categoryId: 'cat-mm',
    heatNumber: 1,
    startsAt: '2026-07-07T08:00:00.000Z',
    endsAt: '2026-07-07T09:02:20.000Z',
    laneCount: 2,
    status: 'scheduled',
  },
];

const heatParticipants: HeatParticipant[] = [
  { id: 'hp-2', heatId: 'heat-1', participantId: 'p2', laneNumber: 2, laneLabel: 'Lane 2' },
  { id: 'hp-1', heatId: 'heat-1', participantId: 'p1', laneNumber: 1, laneLabel: 'Lane 1' },
];

const participants: Participant[] = [
  { id: 'p1', eventId: 'event-1', categoryId: 'cat-mm', displayName: 'Team Alpha', status: 'registered', seedOrder: 1 },
  { id: 'p2', eventId: 'event-1', categoryId: 'cat-mm', displayName: 'Team Bravo', status: 'registered', seedOrder: 2 },
];
