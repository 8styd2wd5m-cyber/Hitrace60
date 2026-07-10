import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteParticipantAction, saveParticipantAction } from '../src/app/admin/events/[eventId]/participants/actions.ts';
import type { EventStatus } from '../src/lib/types.ts';

const participantState = vi.hoisted(() => ({
  auditInserts: [] as unknown[],
  authError: null as Error | null,
  categories: new Map<string, CategoryRowMock>(),
  contextStatus: 'draft' as EventStatus,
  deleteCalls: [] as Array<{ table: string; value: string }>,
  memberDeleteCalls: 0,
  memberInsertCalls: 0,
  operationCalls: 0,
  participants: new Map<string, ParticipantRowMock>(),
  participantUpserts: [] as unknown[],
  serviceClientCalls: 0,
}));

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_EVENT_ID = '99999999-9999-4999-8999-999999999999';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_CATEGORY_ID = '88888888-8888-4888-8888-888888888888';
const PARTICIPANT_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_PARTICIPANT_ID = '77777777-7777-4777-8777-777777777777';
const SAVED_PARTICIPANT_ID = '55555555-5555-4555-8555-555555555555';

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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/action-auth.ts', () => ({
  requireEventAdminByRouteId: vi.fn(async () => {
    if (participantState.authError) {
      throw participantState.authError;
    }

    return {
      event: {
        id: EVENT_ID,
        ownerId: USER_ID,
        slug: 'hitrace60-test',
        status: participantState.contextStatus,
      },
      role: 'owner',
      user: {
        email: 'owner@hitrace60.it',
        id: USER_ID,
      },
    };
  }),
  requireEventOperation: vi.fn((context: { event: { status: EventStatus } }, operation: string) => {
    participantState.operationCalls += 1;

    if (operation !== 'manage_participants') {
      throw new Error('unexpected operation');
    }

    if (context.event.status !== 'draft' && context.event.status !== 'published') {
      throw new Error('state blocked');
    }
  }),
}));

vi.mock('@/lib/supabase/server.ts', () => ({
  createSupabaseServiceClient: vi.fn(() => {
    participantState.serviceClientCalls += 1;
    return createServiceClientMock();
  }),
  hasSupabaseServerConfig: () => true,
}));

describe('participants admin actions security', () => {
  beforeEach(() => {
    participantState.auditInserts = [];
    participantState.authError = null;
    participantState.categories.clear();
    participantState.contextStatus = 'draft';
    participantState.deleteCalls = [];
    participantState.memberDeleteCalls = 0;
    participantState.memberInsertCalls = 0;
    participantState.operationCalls = 0;
    participantState.participants.clear();
    participantState.participantUpserts = [];
    participantState.serviceClientCalls = 0;

    participantState.categories.set(CATEGORY_ID, categoryRow(CATEGORY_ID, EVENT_ID));
    participantState.categories.set(OTHER_CATEGORY_ID, categoryRow(OTHER_CATEGORY_ID, OTHER_EVENT_ID));
    participantState.participants.set(PARTICIPANT_ID, participantRow(PARTICIPANT_ID, EVENT_ID));
    participantState.participants.set(OTHER_PARTICIPANT_ID, participantRow(OTHER_PARTICIPANT_ID, OTHER_EVENT_ID));
  });

  it('saveParticipantAction fallisce senza auth e non usa service role', async () => {
    participantState.authError = new Error('not authenticated');

    const result = await saveParticipantAction('hitrace60-test', validParticipantInput());

    expect(result.ok).toBe(false);
    expect(participantState.serviceClientCalls).toBe(0);
    expect(participantState.participantUpserts).toHaveLength(0);
  });

  it('saveParticipantAction fallisce per utente esterno o viewer prima della service role', async () => {
    participantState.authError = new Error('not authorized');

    const result = await saveParticipantAction('hitrace60-test', validParticipantInput());

    expect(result.ok).toBe(false);
    expect(participantState.serviceClientCalls).toBe(0);
  });

  it.each<EventStatus>(['draft', 'published'])('saveParticipantAction consente owner/admin se evento %s', async (status) => {
    participantState.contextStatus = status;

    const result = await saveParticipantAction('hitrace60-test', validParticipantInput());

    expect(result.ok).toBe(true);
    expect(participantState.operationCalls).toBe(1);
    expect(participantState.participantUpserts).toHaveLength(1);
    expect(participantState.memberDeleteCalls).toBe(1);
    expect(participantState.memberInsertCalls).toBe(1);
    expect(participantState.auditInserts).toHaveLength(1);
  });

  it.each<EventStatus>(['live', 'completed', 'archived'])('saveParticipantAction blocca evento %s prima della service role', async (status) => {
    participantState.contextStatus = status;

    const result = await saveParticipantAction('hitrace60-test', validParticipantInput());

    expect(result.ok).toBe(false);
    expect(participantState.serviceClientCalls).toBe(0);
    expect(participantState.participantUpserts).toHaveLength(0);
  });

  it('saveParticipantAction blocca category cross-event prima della mutation', async () => {
    const result = await saveParticipantAction(
      'hitrace60-test',
      validParticipantInput({
        categoryId: OTHER_CATEGORY_ID,
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContain('Categoria non valida.');
    expect(participantState.participantUpserts).toHaveLength(0);
    expect(participantState.memberDeleteCalls).toBe(0);
  });

  it('saveParticipantAction consente update participant dello stesso evento', async () => {
    const result = await saveParticipantAction(
      'hitrace60-test',
      validParticipantInput({
        id: PARTICIPANT_ID,
      }),
    );

    expect(result.ok).toBe(true);
    expect(participantState.participantUpserts).toHaveLength(1);
  });

  it('saveParticipantAction blocca update participant cross-event prima della mutation', async () => {
    const result = await saveParticipantAction(
      'hitrace60-test',
      validParticipantInput({
        id: OTHER_PARTICIPANT_ID,
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContain('Partecipante non trovato.');
    expect(participantState.participantUpserts).toHaveLength(0);
  });

  it('saveParticipantAction fallisce su participant inesistente', async () => {
    const result = await saveParticipantAction(
      'hitrace60-test',
      validParticipantInput({
        id: '66666666-6666-4666-8666-666666666666',
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContain('Partecipante non trovato.');
    expect(participantState.participantUpserts).toHaveLength(0);
  });

  it('saveParticipantAction fallisce su payload o composizione team non valida prima della service role', async () => {
    const result = await saveParticipantAction(
      'hitrace60-test',
      validParticipantInput({
        members: [{ firstName: 'Solo', lastName: 'Uno', gender: 'M' }],
      }),
    );

    expect(result.ok).toBe(false);
    expect(participantState.participantUpserts).toHaveLength(0);
  });

  it('saveParticipantAction fallisce su membri duplicati prima della service role', async () => {
    const result = await saveParticipantAction(
      'hitrace60-test',
      validParticipantInput({
        members: [
          { firstName: 'Mario', lastName: 'Rossi', gender: 'M' },
          { firstName: ' Mario ', lastName: ' Rossi ', gender: 'M' },
        ],
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContain('Membri duplicati non validi.');
    expect(participantState.serviceClientCalls).toBe(0);
  });

  it('deleteParticipantAction fallisce senza auth e non usa service role', async () => {
    participantState.authError = new Error('not authenticated');

    const result = await deleteParticipantAction('hitrace60-test', EVENT_ID, PARTICIPANT_ID);

    expect(result.ok).toBe(false);
    expect(participantState.serviceClientCalls).toBe(0);
    expect(participantState.deleteCalls).toHaveLength(0);
  });

  it.each<EventStatus>(['live', 'completed', 'archived'])('deleteParticipantAction blocca evento %s prima della service role', async (status) => {
    participantState.contextStatus = status;

    const result = await deleteParticipantAction('hitrace60-test', EVENT_ID, PARTICIPANT_ID);

    expect(result.ok).toBe(false);
    expect(participantState.serviceClientCalls).toBe(0);
    expect(participantState.deleteCalls).toHaveLength(0);
  });

  it('deleteParticipantAction consente owner/admin su evento corretto', async () => {
    const result = await deleteParticipantAction('hitrace60-test', EVENT_ID, PARTICIPANT_ID);

    expect(result.ok).toBe(true);
    expect(participantState.deleteCalls).toEqual([
      {
        table: 'participants',
        value: PARTICIPANT_ID,
      },
    ]);
    expect(participantState.auditInserts).toHaveLength(1);
  });

  it('deleteParticipantAction blocca participant cross-event prima della delete', async () => {
    const result = await deleteParticipantAction('hitrace60-test', EVENT_ID, OTHER_PARTICIPANT_ID);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContain('Partecipante non trovato.');
    expect(participantState.deleteCalls).toHaveLength(0);
  });

  it('deleteParticipantAction fallisce su participant inesistente', async () => {
    const result = await deleteParticipantAction('hitrace60-test', EVENT_ID, '66666666-6666-4666-8666-666666666666');

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors).toContain('Partecipante non trovato.');
    expect(participantState.deleteCalls).toHaveLength(0);
  });
});

function validParticipantInput(overrides: Partial<Parameters<typeof saveParticipantAction>[1]> = {}) {
  return {
    categoryId: CATEGORY_ID,
    displayName: 'Team Alpha',
    eventId: EVENT_ID,
    members: [
      { firstName: 'Mario', gender: 'M' as const, lastName: 'Rossi' },
      { firstName: 'Luigi', gender: 'M' as const, lastName: 'Bianchi' },
    ],
    seedOrder: 1,
    ...overrides,
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

function participantRow(id: string, eventId: string): ParticipantRowMock {
  return {
    bib_number: null,
    category_id: eventId === EVENT_ID ? CATEGORY_ID : OTHER_CATEGORY_ID,
    display_name: 'Team Existing',
    event_id: eventId,
    id,
    seed_order: 1,
    status: 'registered',
  };
}

function createServiceClientMock() {
  return {
    from(table: string) {
      const filters = new Map<string, string>();

      const query = {
        delete() {
          const deleteQuery = {
            error: null,
            eq(column: string, value: string) {
              if (table === 'participant_members' && column === 'participant_id') {
                participantState.memberDeleteCalls += 1;
              }

              if (table === 'participants' && column === 'id') {
                participantState.deleteCalls.push({
                  table,
                  value,
                });
              }

              filters.set(column, value);
              return deleteQuery;
            },
          };

          return deleteQuery;
        },
        eq(column: string, value: string) {
          filters.set(column, value);

          if (table === 'categories' && column === 'event_id') {
            const rows = [...participantState.categories.values()].filter((category) => category.event_id === value);

            return {
              data: rows,
              error: null,
            };
          }

          return query;
        },
        insert(payload: unknown) {
          if (table === 'participants') {
            participantState.participantUpserts.push(payload);

            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        ...(payload as Record<string, unknown>),
                        id: SAVED_PARTICIPANT_ID,
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          }

          if (table === 'participant_members') {
            participantState.memberInsertCalls += 1;

            return {
              select() {
                return Promise.resolve({
                  data: [
                    {
                      first_name: 'Mario',
                      gender: 'M',
                      id: 'member-1',
                      last_name: 'Rossi',
                      member_order: 1,
                      participant_id: SAVED_PARTICIPANT_ID,
                    },
                    {
                      first_name: 'Luigi',
                      gender: 'M',
                      id: 'member-2',
                      last_name: 'Bianchi',
                      member_order: 2,
                      participant_id: SAVED_PARTICIPANT_ID,
                    },
                  ],
                  error: null,
                });
              },
            };
          }

          if (table === 'audit_logs') {
            participantState.auditInserts.push(payload);
          }

          return {
            error: null,
          };
        },
        async maybeSingle() {
          if (table === 'participants') {
            const id = filters.get('id');
            const row = id ? participantState.participants.get(id) : null;

            return {
              data: row ?? null,
              error: null,
            };
          }

          return {
            data: null,
            error: null,
          };
        },
        order() {
          return query;
        },
        select() {
          return query;
        },
        update(payload: unknown) {
          participantState.participantUpserts.push(payload);

          return {
            eq() {
              return {
                eq() {
                  return {
                    select() {
                      return {
                        async single() {
                          return {
                            data: {
                              ...(payload as Record<string, unknown>),
                              id: PARTICIPANT_ID,
                            },
                            error: null,
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };

      return query;
    },
  };
}
