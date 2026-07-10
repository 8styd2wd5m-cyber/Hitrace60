import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteEventEditionAction, duplicateEventStructureAction } from '../src/app/admin/events/actions.ts';
import { updateEventStatusAction } from '../src/app/admin/events/[eventId]/actions.ts';
import type { EventStatus } from '../src/lib/types.ts';

const actionState = vi.hoisted(() => ({
  auditInserts: [] as unknown[],
  authError: null as Error | null,
  deleteCalls: [] as Array<{ column: string; table: string; value: string }>,
  eventInsert: null as Record<string, unknown> | null,
  operationError: null as Error | null,
  serviceClientCalls: 0,
  statusUpdate: null as Record<string, unknown> | null,
}));

const AUTHORIZED_EVENT_ID = '11111111-1111-4111-8111-111111111111';
const AUTHORIZED_USER_ID = '22222222-2222-4222-8222-222222222222';
const CREATED_EVENT_ID = '33333333-3333-4333-8333-333333333333';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/action-auth.ts', () => ({
  ensureEventOwnerAdmin: vi.fn(async () => undefined),
  ensureProfileForUser: vi.fn(async () => undefined),
  requireEventAdminByRouteId: vi.fn(async () => {
    if (actionState.authError) {
      throw actionState.authError;
    }

    return {
      event: {
        id: AUTHORIZED_EVENT_ID,
        ownerId: AUTHORIZED_USER_ID,
        slug: 'source-event',
        status: 'draft' as EventStatus,
      },
      role: 'owner',
      user: {
        email: 'owner@hitrace60.it',
        id: AUTHORIZED_USER_ID,
      },
    };
  }),
  requireEventOperation: vi.fn(() => {
    if (actionState.operationError) {
      throw actionState.operationError;
    }
  }),
}));

vi.mock('@/lib/supabase/server.ts', () => ({
  createSupabaseServiceClient: vi.fn(() => {
    actionState.serviceClientCalls += 1;
    return createServiceClientMock();
  }),
  hasSupabaseServerConfig: () => true,
}));

describe('admin P0 actions authorization order', () => {
  beforeEach(() => {
    actionState.auditInserts = [];
    actionState.authError = null;
    actionState.deleteCalls = [];
    actionState.eventInsert = null;
    actionState.operationError = null;
    actionState.serviceClientCalls = 0;
    actionState.statusUpdate = null;
  });

  it('duplicateEventStructureAction non usa service role se auth fallisce', async () => {
    actionState.authError = new Error('not authenticated');

    const result = await duplicateEventStructureAction(validDuplicateInput());

    expect(result.ok).toBe(false);
    expect(actionState.serviceClientCalls).toBe(0);
  });

  it('duplicateEventStructureAction crea evento solo dopo authorization e usa owner autenticato', async () => {
    const result = await duplicateEventStructureAction({
      ...validDuplicateInput(),
      copyCategories: false,
      copyJudges: false,
      copySettings: false,
      copyStations: false,
    });

    expect(result.ok).toBe(true);
    expect(actionState.serviceClientCalls).toBeGreaterThan(0);
    expect(actionState.eventInsert).toMatchObject({
      duplicated_from_event_id: AUTHORIZED_EVENT_ID,
      owner_id: AUTHORIZED_USER_ID,
      slug: 'target-event',
      status: 'draft',
    });
  });

  it('deleteEventEditionAction non usa service role se auth fallisce', async () => {
    actionState.authError = new Error('not authorized');

    const result = await deleteEventEditionAction({
      confirmationSlug: 'source-event',
      routeEventId: 'source-event',
    });

    expect(result.ok).toBe(false);
    expect(actionState.serviceClientCalls).toBe(0);
  });

  it('deleteEventEditionAction non cancella se lo stato evento non consente delete', async () => {
    actionState.operationError = new Error('state blocked');

    const result = await deleteEventEditionAction({
      confirmationSlug: 'source-event',
      routeEventId: 'source-event',
    });

    expect(result.ok).toBe(false);
    expect(actionState.serviceClientCalls).toBe(0);
    expect(actionState.deleteCalls).toHaveLength(0);
  });

  it('deleteEventEditionAction cancella solo dopo authorization e conferma slug corretta', async () => {
    const result = await deleteEventEditionAction({
      confirmationSlug: 'source-event',
      routeEventId: 'source-event',
    });

    expect(result.ok).toBe(true);
    expect(actionState.serviceClientCalls).toBe(1);
    expect(actionState.deleteCalls.some((call) => call.table === 'events' && call.value === AUTHORIZED_EVENT_ID)).toBe(true);
  });

  it('updateEventStatusAction non usa service role se auth fallisce', async () => {
    actionState.authError = new Error('not authenticated');

    const result = await updateEventStatusAction('source-event', 'published');

    expect(result.ok).toBe(false);
    expect(actionState.serviceClientCalls).toBe(0);
  });

  it('updateEventStatusAction non aggiorna se transizione non autorizzata', async () => {
    actionState.operationError = new Error('invalid transition');

    const result = await updateEventStatusAction('source-event', 'live');

    expect(result.ok).toBe(false);
    expect(actionState.serviceClientCalls).toBe(0);
    expect(actionState.statusUpdate).toBeNull();
  });

  it('updateEventStatusAction aggiorna e scrive audit log con authenticated user id', async () => {
    const result = await updateEventStatusAction('source-event', 'published');

    expect(result.ok).toBe(true);
    expect(actionState.statusUpdate).toMatchObject({
      status: 'published',
    });
    expect(actionState.auditInserts).toHaveLength(1);
    expect(actionState.auditInserts[0]).toMatchObject({
      actor_user_id: AUTHORIZED_USER_ID,
      entity_id: AUTHORIZED_EVENT_ID,
      event_id: AUTHORIZED_EVENT_ID,
      old_data: {
        status: 'draft',
      },
      new_data: {
        status: 'published',
      },
    });
  });
});

function validDuplicateInput() {
  return {
    copyCategories: true,
    copyJudgeTokens: false,
    copyJudges: true,
    copySettings: true,
    copyStations: true,
    editionLabel: 'Ottobre 2026',
    endsAt: '2026-10-11T18:00',
    location: 'Demo Arena',
    name: 'HITRACE60 Ottobre 2026',
    slug: 'target-event',
    sourceEventId: 'source-event',
    startsAt: '2026-10-10T08:00',
  };
}

function createServiceClientMock() {
  return {
    from(table: string) {
      const filters = new Map<string, string>();

      const query = {
        delete() {
          return {
            async eq(column: string, value: string) {
              actionState.deleteCalls.push({
                column,
                table,
                value,
              });

              return {
                error: null,
              };
            },
          };
        },
        eq(column: string, value: string) {
          filters.set(column, value);
          return query;
        },
        insert(payload: unknown) {
          if (table === 'events') {
            actionState.eventInsert = payload as Record<string, unknown>;

            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: CREATED_EVENT_ID,
                        slug: 'target-event',
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          }

          if (table === 'audit_logs') {
            actionState.auditInserts.push(payload);
          }

          return {
            error: null,
          };
        },
        async maybeSingle() {
          if (table === 'events' && filters.get('slug') === 'target-event') {
            return {
              data: null,
              error: null,
            };
          }

          if (table === 'events' && filters.get('id') === AUTHORIZED_EVENT_ID) {
            return {
              data: {
                id: AUTHORIZED_EVENT_ID,
                timezone: 'Europe/Rome',
              },
              error: null,
            };
          }

          return {
            data: null,
            error: null,
          };
        },
        select() {
          return query;
        },
        update(payload: Record<string, unknown>) {
          actionState.statusUpdate = payload;

          return {
            async eq() {
              return {
                error: null,
              };
            },
          };
        },
      };

      return query;
    },
  };
}
