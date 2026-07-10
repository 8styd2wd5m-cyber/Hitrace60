import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEventEditionAction } from '../src/app/admin/events/new/actions.ts';

const createEventState = vi.hoisted(() => ({
  auditInserts: [] as unknown[],
  authConfig: true,
  cleanupDeletes: [] as string[],
  eventAdminUpserts: [] as unknown[],
  eventInserts: [] as unknown[],
  existingProfile: null as { full_name: string | null; id: string } | null,
  existingSlug: false,
  failStep: null as string | null,
  judgeInserts: [] as unknown[],
  profileInserts: [] as unknown[],
  profileUpdates: [] as unknown[],
  serviceClientCalls: 0,
  structureSteps: [] as string[],
  user: null as { email?: string; id: string; user_metadata?: Record<string, unknown> } | null,
}));

const USER_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const SEEDED_ADMIN_OWNER_ID = '00000000-0000-0000-0000-000000000001';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/auth-server.ts', () => ({
  createSupabaseUserServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: createEventState.user,
        },
        error: null,
      })),
    },
  })),
}));

vi.mock('@/lib/supabase/server.ts', () => ({
  createSupabaseServiceClient: vi.fn(() => {
    createEventState.serviceClientCalls += 1;
    return createServiceClientMock();
  }),
  hasSupabaseAuthConfig: () => createEventState.authConfig,
  hasSupabaseServerConfig: () => true,
  hasSupabaseServiceConfig: () => true,
}));

describe('createEventEditionAction security', () => {
  beforeEach(() => {
    createEventState.auditInserts = [];
    createEventState.authConfig = true;
    createEventState.cleanupDeletes = [];
    createEventState.eventAdminUpserts = [];
    createEventState.eventInserts = [];
    createEventState.existingProfile = {
      full_name: 'Andrea Admin',
      id: USER_ID,
    };
    createEventState.existingSlug = false;
    createEventState.failStep = null;
    createEventState.judgeInserts = [];
    createEventState.profileInserts = [];
    createEventState.profileUpdates = [];
    createEventState.serviceClientCalls = 0;
    createEventState.structureSteps = [];
    createEventState.user = {
      email: 'andrea@hitrace60.it',
      id: USER_ID,
      user_metadata: {},
    };
  });

  it('blocca anonimo e non chiama service role', async () => {
    createEventState.user = null;

    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(false);
    expect(createEventState.serviceClientCalls).toBe(0);
    expect(createEventState.eventInserts).toHaveLength(0);
  });

  it('blocca config auth mancante e non chiama service role', async () => {
    createEventState.authConfig = false;

    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(false);
    expect(createEventState.serviceClientCalls).toBe(0);
  });

  it('riusa profilo esistente senza sovrascrivere full_name', async () => {
    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(true);
    expect(createEventState.profileInserts).toHaveLength(0);
    expect(createEventState.profileUpdates).toHaveLength(0);
  });

  it('crea profilo mancante usando metadata full_name', async () => {
    createEventState.existingProfile = null;
    createEventState.user = {
      email: 'andrea@hitrace60.it',
      id: USER_ID,
      user_metadata: {
        full_name: 'Andrea Barbotti',
      },
    };

    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(true);
    expect(createEventState.profileInserts[0]).toMatchObject({
      full_name: 'Andrea Barbotti',
      id: USER_ID,
    });
  });

  it('crea profilo mancante usando fallback da email', async () => {
    createEventState.existingProfile = null;

    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(true);
    expect(createEventState.profileInserts[0]).toMatchObject({
      full_name: 'andrea',
      id: USER_ID,
    });
  });

  it('aggiorna profilo esistente con full_name vuoto senza usare null', async () => {
    createEventState.existingProfile = {
      full_name: '',
      id: USER_ID,
    };

    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(true);
    expect(createEventState.profileUpdates[0]).toMatchObject({
      full_name: 'andrea',
    });
    expect(createEventState.profileInserts).toHaveLength(0);
  });

  it('errore profilo blocca creazione evento', async () => {
    createEventState.failStep = 'insert:profiles';
    createEventState.existingProfile = null;

    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(false);
    expect(createEventState.eventInserts).toHaveLength(0);
  });

  it.each([
    ['nome vuoto', { name: '' }],
    ['edition label vuota', { editionLabel: '' }],
    ['slug vuoto', { slug: '' }],
    ['slug con slash', { slug: 'bad/slug' }],
    ['timezone invalida', { timezone: 'Nope/Nowhere' }],
    ['lane non valida', { defaultLaneCount: 0 }],
  ])('blocca input non valido: %s', async (_label, override) => {
    const result = await createEventEditionAction({
      ...validInput(),
      ...override,
    });

    expect(result.ok).toBe(false);
    expect(createEventState.eventInserts).toHaveLength(0);
  });

  it('normalizza slug uppercase a lowercase', async () => {
    const result = await createEventEditionAction({
      ...validInput(),
      slug: 'HITRACE60-OTTOBRE-2026',
    });

    expect(result.ok).toBe(true);
    expect(createEventState.eventInserts[0]).toMatchObject({
      slug: 'hitrace60-ottobre-2026',
    });
  });

  it('blocca status iniziale non consentito nel payload runtime', async () => {
    const result = await createEventEditionAction({
      ...validInput(),
      status: 'live',
    } as Parameters<typeof createEventEditionAction>[0]);

    expect(result.ok).toBe(false);
    expect(createEventState.eventInserts).toHaveLength(0);
  });

  it('blocca slug duplicato prima dell insert evento', async () => {
    createEventState.existingSlug = true;

    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(false);
    expect(createEventState.eventInserts).toHaveLength(0);
  });

  it('crea evento con owner autenticato e mai owner seed', async () => {
    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(true);
    expect(createEventState.eventInserts[0]).toMatchObject({
      owner_id: USER_ID,
      slug: 'hitrace60-ottobre-2026',
      status: 'draft',
    });
    expect(createEventState.eventInserts[0]).not.toMatchObject({
      owner_id: SEEDED_ADMIN_OWNER_ID,
    });
  });

  it('ignora/rifiuta ownerId client e non crea evento', async () => {
    const result = await createEventEditionAction({
      ...validInput(),
      ownerId: SEEDED_ADMIN_OWNER_ID,
    } as Parameters<typeof createEventEditionAction>[0]);

    expect(result.ok).toBe(false);
    expect(createEventState.eventInserts).toHaveLength(0);
  });

  it('crea event_admins owner reale', async () => {
    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(true);
    expect(createEventState.eventAdminUpserts[0]).toMatchObject({
      event_id: EVENT_ID,
      role: 'owner',
      user_id: USER_ID,
    });
  });

  it('crea struttura standard senza dati gara', async () => {
    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(true);
    expect(createEventState.structureSteps).toEqual([
      'insert:event_settings',
      'insert:categories',
      'insert:stations',
      'insert:judges',
      'insert:judge_station_assignments',
      'insert:audit_logs',
    ]);
    expect(createEventState.structureSteps).not.toContain('insert:participants');
    expect(createEventState.structureSteps).not.toContain('insert:heats');
    expect(createEventState.structureSteps).not.toContain('insert:scores');
  });

  it('crea audit log con user reale', async () => {
    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(true);
    expect(createEventState.auditInserts[0]).toMatchObject({
      actor_user_id: USER_ID,
      entity_id: EVENT_ID,
      event_id: EVENT_ID,
      new_data: {
        edition_label: 'Ottobre 2026',
        slug: 'hitrace60-ottobre-2026',
        status: 'draft',
      },
    });
  });

  it('errore insert evento non esegue fasi successive', async () => {
    createEventState.failStep = 'insert:events';

    const result = await createEventEditionAction(validInput());

    expect(result.ok).toBe(false);
    expect(createEventState.structureSteps).toEqual([]);
  });

  it.each(['insert:event_settings', 'insert:categories', 'insert:stations', 'insert:judges'])(
    'errore %s fallisce e chiama cleanup compensativo',
    async (step) => {
      createEventState.failStep = step;

      const result = await createEventEditionAction(validInput());

      expect(result.ok).toBe(false);
      expect(createEventState.cleanupDeletes).toEqual([EVENT_ID]);
      expect(createEventState.structureSteps).toContain(step);
      expect(createEventState.structureSteps).not.toContain('insert:audit_logs');
    },
  );
});

function validInput() {
  return {
    createJudges: true,
    defaultLaneCount: 6,
    editionLabel: 'Ottobre 2026',
    endsAt: '2026-10-11T18:00',
    location: 'Demo Arena',
    name: 'HITRACE60 Ottobre 2026',
    slug: 'hitrace60-ottobre-2026',
    startsAt: '2026-10-10T08:00',
    timezone: 'Europe/Rome',
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
              filters.set(column, value);

              if (table === 'events' && column === 'id') {
                createEventState.cleanupDeletes.push(value);
              }

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
          const step = `insert:${table}`;

          if (table !== 'profiles' && table !== 'events') {
            createEventState.structureSteps.push(step);
          }

          if (table === 'profiles') {
            if (createEventState.failStep === step) {
              return Promise.resolve({ error: { message: 'profile failed' } });
            }

            createEventState.profileInserts.push(payload);
            return Promise.resolve({ error: null });
          }

          if (table === 'events') {
            if (createEventState.failStep === step) {
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: null,
                        error: { message: 'event failed' },
                      };
                    },
                  };
                },
              };
            }

            createEventState.eventInserts.push(payload);
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: EVENT_ID,
                        slug: 'hitrace60-ottobre-2026',
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          }

          if (table === 'event_settings' || table === 'categories') {
            return Promise.resolve({
              error: createEventState.failStep === step ? { message: `${table} failed` } : null,
            });
          }

          if (table === 'stations') {
            return {
              select() {
                return Promise.resolve({
                  data:
                    createEventState.failStep === step
                      ? null
                      : [
                          {
                            id: 'station-echo-bike',
                            name: 'Echo Bike',
                            slug: 'echo-bike',
                          },
                        ],
                  error: createEventState.failStep === step ? { message: 'stations failed' } : null,
                });
              },
            };
          }

          if (table === 'judges') {
            if (createEventState.failStep === step) {
              return {
                select() {
                  return {
                    async single() {
                      return {
                        data: null,
                        error: { message: 'judges failed' },
                      };
                    },
                  };
                },
              };
            }

            createEventState.judgeInserts.push(payload);
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: {
                        id: 'judge-1',
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          }

          if (table === 'judge_station_assignments') {
            return Promise.resolve({
              error: createEventState.failStep === step ? { message: 'assignments failed' } : null,
            });
          }

          if (table === 'audit_logs') {
            createEventState.auditInserts.push(payload);
          }

          return Promise.resolve({ error: null });
        },
        async maybeSingle() {
          if (table === 'profiles') {
            return {
              data: createEventState.existingProfile,
              error: null,
            };
          }

          if (table === 'events') {
            return {
              data: createEventState.existingSlug ? { id: EVENT_ID } : null,
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
        update(payload: unknown) {
          createEventState.profileUpdates.push(payload);

          return {
            async eq() {
              return {
                error: null,
              };
            },
          };
        },
        async upsert(payload: unknown) {
          createEventState.eventAdminUpserts.push(payload);

          return {
            error: null,
          };
        },
      };

      return query;
    },
  };
}
