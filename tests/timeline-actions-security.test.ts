import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveTimelineAction } from '../src/app/admin/events/[eventId]/timeline/actions.ts';
import type { EventStatus } from '../src/lib/types.ts';

const timelineState = vi.hoisted(() => ({
  assignments: [] as AssignmentRowMock[],
  authError: null as Error | null,
  categories: [] as CategoryRowMock[],
  contextStatus: 'draft' as EventStatus,
  existingHeats: [] as ExistingHeatRowMock[],
  failStep: null as string | null,
  mutationSteps: [] as string[],
  operationCalls: 0,
  participants: [] as ParticipantRowMock[],
  returnCrossEventHeats: false,
  returnCrossEventParticipants: false,
  serviceClientCalls: 0,
  stations: [] as StationRowMock[],
}));

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_EVENT_ID = '99999999-9999-4999-8999-999999999999';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_CATEGORY_ID = '88888888-8888-4888-8888-888888888888';
const PARTICIPANT_A_ID = '44444444-4444-4444-8444-444444444444';
const PARTICIPANT_B_ID = '55555555-5555-4555-8555-555555555555';
const STATION_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_STATION_ID = '77777777-7777-4777-8777-777777777777';
const EXISTING_HEAT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type CategoryRowMock = {
  code: 'MM';
  event_id: string;
  id: string;
  name: string;
  race_day: string | null;
  start_order: number;
  team_size: 2;
  type: 'team_2';
};

type ParticipantRowMock = {
  bib_number: string | null;
  category_id: string;
  display_name: string;
  event_id: string;
  id: string;
  seed_order: number;
  status: 'registered';
};

type StationRowMock = {
  active: boolean;
  event_id: string;
  higher_is_better: boolean;
  id: string;
  is_scored: boolean;
  name: string;
  score_type: string;
  score_unit: string;
  slug: string;
  station_order: number;
};

type AssignmentRowMock = {
  id: string;
  station_id: string;
};

type ExistingHeatRowMock = {
  category_id: string;
  event_id: string;
  heat_number: number;
  id: string;
};

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/action-auth.ts', () => ({
  requireEventAdminByRouteId: vi.fn(async () => {
    if (timelineState.authError) {
      throw timelineState.authError;
    }

    return {
      event: {
        id: EVENT_ID,
        ownerId: USER_ID,
        slug: 'hitrace60-test',
        status: timelineState.contextStatus,
      },
      role: 'owner',
      user: {
        email: 'owner@hitrace60.it',
        id: USER_ID,
      },
    };
  }),
  requireEventOperation: vi.fn((context: { event: { status: EventStatus } }, operation: string) => {
    timelineState.operationCalls += 1;

    if (operation !== 'manage_timeline') {
      throw new Error('unexpected operation');
    }

    if (context.event.status !== 'draft' && context.event.status !== 'published') {
      throw new Error('state blocked');
    }
  }),
}));

vi.mock('@/lib/supabase/server.ts', () => ({
  createSupabaseServiceClient: vi.fn(() => {
    timelineState.serviceClientCalls += 1;
    return createServiceClientMock();
  }),
  hasSupabaseServerConfig: () => true,
}));

describe('timeline admin action security', () => {
  beforeEach(() => {
    timelineState.assignments = [{ id: 'assignment-1', station_id: STATION_ID }];
    timelineState.authError = null;
    timelineState.categories = [categoryRow(CATEGORY_ID, EVENT_ID)];
    timelineState.contextStatus = 'draft';
    timelineState.existingHeats = [existingHeatRow(EXISTING_HEAT_ID, EVENT_ID, CATEGORY_ID)];
    timelineState.failStep = null;
    timelineState.mutationSteps = [];
    timelineState.operationCalls = 0;
    timelineState.participants = [
      participantRow(PARTICIPANT_A_ID, EVENT_ID, CATEGORY_ID, 1),
      participantRow(PARTICIPANT_B_ID, EVENT_ID, CATEGORY_ID, 2),
    ];
    timelineState.returnCrossEventHeats = false;
    timelineState.returnCrossEventParticipants = false;
    timelineState.serviceClientCalls = 0;
    timelineState.stations = [stationRow(STATION_ID, EVENT_ID)];
  });

  it('blocca anonimo prima della service role', async () => {
    timelineState.authError = new Error('not authenticated');

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(false);
    expect(timelineState.serviceClientCalls).toBe(0);
    expect(timelineState.mutationSteps).toHaveLength(0);
  });

  it('blocca utente esterno o viewer prima della service role', async () => {
    timelineState.authError = new Error('not authorized');

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(false);
    expect(timelineState.serviceClientCalls).toBe(0);
  });

  it.each<EventStatus>(['draft', 'published'])('consente owner/admin se evento %s', async (status) => {
    timelineState.contextStatus = status;

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(true);
    expect(timelineState.operationCalls).toBe(1);
    expect(timelineState.mutationSteps).toEqual([
      'delete:scorecards',
      'delete:timeline_blocks',
      'delete:heat_participants',
      'upsert:heats',
      'insert:heat_participants',
      'upsert:timeline_blocks',
      'upsert:scorecards',
      'insert:audit_logs',
    ]);
    expect(result.counts?.scorecards).toBe(2);
  });

  it.each<EventStatus>(['live', 'completed', 'archived'])('blocca evento %s prima della service role', async (status) => {
    timelineState.contextStatus = status;

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(false);
    expect(timelineState.serviceClientCalls).toBe(0);
    expect(timelineState.mutationSteps).toHaveLength(0);
  });

  it('blocca evento inesistente o non autorizzato', async () => {
    timelineState.authError = new Error('event not found');

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(false);
    expect(timelineState.serviceClientCalls).toBe(0);
  });

  it('blocca eventId client diverso dall evento autorizzato', async () => {
    const result = await saveTimelineAction({
      ...validInput(),
      eventId: OTHER_EVENT_ID,
    });

    expect(result.ok).toBe(false);
    expect(timelineState.serviceClientCalls).toBe(0);
  });

  it('blocca categoria cross-event prima delle mutation', async () => {
    const result = await saveTimelineAction({
      ...validInput(),
      selectedCategoryIds: [OTHER_CATEGORY_ID],
      categoryStarts: {
        [OTHER_CATEGORY_ID]: '2026-09-10T08:00:00.000Z',
      },
    });

    expect(result.ok).toBe(false);
    expect(timelineState.mutationSteps).toHaveLength(0);
  });

  it('blocca participant cross-event prima delle mutation', async () => {
    timelineState.participants.push(participantRow('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', OTHER_EVENT_ID, CATEGORY_ID, 3));
    timelineState.returnCrossEventParticipants = true;

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Partecipante non valido.');
    expect(timelineState.mutationSteps).toHaveLength(0);
  });

  it('blocca participant con category di altro evento', async () => {
    timelineState.participants[0] = participantRow(PARTICIPANT_A_ID, EVENT_ID, OTHER_CATEGORY_ID, 1);

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Partecipante non valido.');
    expect(timelineState.mutationSteps).toHaveLength(0);
  });

  it('blocca heat esistente cross-event prima delle mutation', async () => {
    timelineState.existingHeats = [existingHeatRow(EXISTING_HEAT_ID, OTHER_EVENT_ID, CATEGORY_ID)];
    timelineState.returnCrossEventHeats = true;

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Heat non valida.');
    expect(timelineState.mutationSteps).toHaveLength(0);
  });

  it('blocca station cross-event prima delle mutation', async () => {
    timelineState.stations = [stationRow(OTHER_STATION_ID, OTHER_EVENT_ID)];

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Stazioni non valide.');
    expect(timelineState.mutationSteps).toHaveLength(0);
  });

  it('blocca lane count non valido prima della service role', async () => {
    const result = await saveTimelineAction({
      ...validInput(),
      laneCount: 0,
    });

    expect(result.ok).toBe(false);
    expect(timelineState.serviceClientCalls).toBe(0);
  });

  it('blocca categorie duplicate prima della service role', async () => {
    const result = await saveTimelineAction({
      ...validInput(),
      selectedCategoryIds: [CATEGORY_ID, CATEGORY_ID],
    });

    expect(result.ok).toBe(false);
    expect(timelineState.serviceClientCalls).toBe(0);
  });

  it('blocca start time invalido prima della service role', async () => {
    const result = await saveTimelineAction({
      ...validInput(),
      categoryStarts: {
        [CATEGORY_ID]: 'not-a-date',
      },
    });

    expect(result.ok).toBe(false);
    expect(timelineState.serviceClientCalls).toBe(0);
  });

  it('blocca durata/intervallo negativo o NaN prima della service role', async () => {
    const result = await saveTimelineAction({
      ...validInput(),
      workIntervalSeconds: Number.NaN,
    });

    expect(result.ok).toBe(false);
    expect(timelineState.serviceClientCalls).toBe(0);
  });

  it('blocca payload incompleto prima della service role', async () => {
    const result = await saveTimelineAction({
      ...validInput(),
      selectedCategoryIds: [],
    });

    expect(result.ok).toBe(false);
    expect(timelineState.serviceClientCalls).toBe(0);
  });

  it('blocca participant duplicato generato prima delle mutation', async () => {
    timelineState.participants.push(participantRow(PARTICIPANT_A_ID, EVENT_ID, CATEGORY_ID, 3));

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Partecipante duplicato non valido.');
    expect(timelineState.mutationSteps).toHaveLength(0);
  });

  it('errore durante delete interrompe gli insert successivi', async () => {
    timelineState.failStep = 'delete:timeline_blocks';

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(false);
    expect(timelineState.mutationSteps).toEqual(['delete:scorecards', 'delete:timeline_blocks']);
  });

  it('errore durante upsert heats interrompe gli step successivi', async () => {
    timelineState.failStep = 'upsert:heats';

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(false);
    expect(timelineState.mutationSteps).toEqual([
      'delete:scorecards',
      'delete:timeline_blocks',
      'delete:heat_participants',
      'upsert:heats',
    ]);
  });

  it('errore durante scorecards fallisce senza dichiarare successo', async () => {
    timelineState.failStep = 'upsert:scorecards';

    const result = await saveTimelineAction(validInput());

    expect(result.ok).toBe(false);
    expect(timelineState.mutationSteps).toContain('upsert:scorecards');
    expect(timelineState.mutationSteps).not.toContain('insert:audit_logs');
  });
});

function validInput() {
  return {
    categoryStarts: {
      [CATEGORY_ID]: '2026-09-10T08:00:00.000Z',
    },
    eventId: EVENT_ID,
    laneCount: 1,
    pauseAfterCategoryMinutes: 0,
    routeEventId: 'hitrace60-test',
    selectedCategoryIds: [CATEGORY_ID],
    stationTransitionSeconds: 10,
    totalStations: 15,
    workIntervalSeconds: 240,
  };
}

function categoryRow(id: string, eventId: string): CategoryRowMock {
  return {
    code: 'MM',
    event_id: eventId,
    id,
    name: 'Team MM',
    race_day: null,
    start_order: 1,
    team_size: 2,
    type: 'team_2',
  };
}

function participantRow(id: string, eventId: string, categoryId: string, seedOrder: number): ParticipantRowMock {
  return {
    bib_number: null,
    category_id: categoryId,
    display_name: `Team ${seedOrder}`,
    event_id: eventId,
    id,
    seed_order: seedOrder,
    status: 'registered',
  };
}

function stationRow(id: string, eventId: string): StationRowMock {
  return {
    active: true,
    event_id: eventId,
    higher_is_better: true,
    id,
    is_scored: true,
    name: 'Echo Bike',
    score_type: 'numeric',
    score_unit: 'cal',
    slug: 'echo-bike',
    station_order: 1,
  };
}

function existingHeatRow(id: string, eventId: string, categoryId: string): ExistingHeatRowMock {
  return {
    category_id: categoryId,
    event_id: eventId,
    heat_number: 1,
    id,
  };
}

function createServiceClientMock() {
  return {
    from(table: string) {
      const filters = new Map<string, unknown>();

      const query = {
        delete() {
          const deleteQuery = {
            eq(column: string, value: string) {
              filters.set(column, value);
              return deleteQuery;
            },
            in() {
              const step = `delete:${table}`;
              timelineState.mutationSteps.push(step);

              return Promise.resolve({
                error: timelineState.failStep === step ? { message: 'forced delete failure' } : null,
              });
            },
          };

          return deleteQuery;
        },
        eq(column: string, value: unknown) {
          filters.set(column, value);
          return query;
        },
        in(column: string, values: string[]) {
          filters.set(column, values);

          if (table === 'categories') {
            const eventId = filters.get('event_id');
            const rows = timelineState.categories.filter(
              (category) => category.event_id === eventId && values.includes(category.id),
            );

            return Promise.resolve({
              data: rows,
              error: null,
            });
          }

          if (table === 'heats') {
            const eventId = filters.get('event_id');
            const rows = timelineState.returnCrossEventHeats
              ? timelineState.existingHeats
              : timelineState.existingHeats.filter((heat) => heat.event_id === eventId && values.includes(heat.category_id));

            return Promise.resolve({
              data: rows,
              error: null,
            });
          }

          return Promise.resolve({
            data: [],
            error: null,
          });
        },
        insert() {
          const step = `insert:${table}`;
          timelineState.mutationSteps.push(step);

          return Promise.resolve({
            data: null,
            error: timelineState.failStep === step ? { message: 'forced insert failure' } : null,
          });
        },
        select() {
          return query;
        },
        upsert() {
          const step = `upsert:${table}`;
          timelineState.mutationSteps.push(step);

          return Promise.resolve({
            data: null,
            error: timelineState.failStep === step ? { message: 'forced upsert failure' } : null,
          });
        },
      };

      if (table === 'participants') {
        query.eq = (column: string, value: unknown) => {
          filters.set(column, value);

          if (column === 'event_id') {
            return Promise.resolve({
              data: timelineState.returnCrossEventParticipants
                ? timelineState.participants
                : timelineState.participants.filter((participant) => participant.event_id === value),
              error: null,
            }) as unknown as typeof query;
          }

          return query;
        };
      }

      if (table === 'stations') {
        query.eq = (column: string, value: unknown) => {
          filters.set(column, value);

          if (column === 'active') {
            const eventId = filters.get('event_id');

            return Promise.resolve({
              data: timelineState.stations.filter((station) => station.event_id === eventId && station.is_scored && station.active),
              error: null,
            }) as unknown as typeof query;
          }

          return query;
        };
      }

      if (table === 'judge_station_assignments') {
        query.eq = (column: string, value: unknown) => {
          filters.set(column, value);

          if (column === 'active') {
            return Promise.resolve({
              data: timelineState.assignments,
              error: null,
            }) as unknown as typeof query;
          }

          return query;
        };
      }

      return query;
    },
  };
}
