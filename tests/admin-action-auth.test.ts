import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminActionError } from '../src/lib/auth/action-errors.ts';
import {
  EVENT_ROLE_PERMISSIONS,
  requireAuthenticatedUser,
  requireEventAdmin,
  requireEventAdminByRouteId,
  requireEventOperation,
  requireEventPermission,
  requireEventPermissionByRouteId,
} from '../src/lib/auth/action-auth.ts';
import type { EventStatus } from '../src/lib/types.ts';

const testState = vi.hoisted(() => ({
  authConfig: true,
  serviceConfig: true,
  serviceClientCalls: 0,
  userClientCalls: 0,
  user: null as { email?: string; id: string } | null,
  eventAdmins: new Map<string, { event_id: string; role: string; user_id: string }>(),
  events: new Map<string, { id: string; owner_id: string; slug: string | null; status: EventStatus }>(),
}));

vi.mock('@/lib/supabase/auth-server.ts', () => ({
  createSupabaseUserServerClient: vi.fn(async () => {
    testState.userClientCalls += 1;

    return {
      __clientType: 'user',
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: testState.user,
          },
          error: null,
        })),
      },
      ...createServiceClientMock(),
    };
  }),
}));

vi.mock('@/lib/supabase/server.ts', () => ({
  createSupabaseServiceClient: vi.fn(() => {
    testState.serviceClientCalls += 1;
    return createServiceClientMock();
  }),
  hasSupabaseAuthConfig: () => testState.authConfig,
  hasSupabaseServiceConfig: () => testState.serviceConfig,
}));

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const OUTSIDER_ID = '44444444-4444-4444-8444-444444444444';

describe('admin action authorization helpers', () => {
  beforeEach(() => {
    testState.authConfig = true;
    testState.serviceConfig = true;
    testState.serviceClientCalls = 0;
    testState.userClientCalls = 0;
    testState.user = null;
    testState.eventAdmins.clear();
    testState.events.clear();
    testState.events.set(EVENT_ID, {
      id: EVENT_ID,
      owner_id: OWNER_ID,
      slug: 'hitrace60-test',
      status: 'draft',
    });
  });

  it('requireAuthenticatedUser fallisce se manca la config auth', async () => {
    testState.authConfig = false;

    await expect(requireAuthenticatedUser()).rejects.toMatchObject({
      code: 'auth_config_missing',
    });
  });

  it('requireAuthenticatedUser fallisce senza utente', async () => {
    testState.user = null;

    await expect(requireAuthenticatedUser()).rejects.toMatchObject({
      code: 'not_authenticated',
    });
  });

  it('requireAuthenticatedUser restituisce utente autenticato', async () => {
    testState.user = {
      email: 'admin@hitrace60.it',
      id: OWNER_ID,
    };

    await expect(requireAuthenticatedUser()).resolves.toEqual({
      email: 'admin@hitrace60.it',
      id: OWNER_ID,
    });
  });

  it('matrice permessi assegna owner/admin/viewer in modo esplicito', () => {
    expect(EVENT_ROLE_PERMISSIONS.owner).toContain('event.delete');
    expect(EVENT_ROLE_PERMISSIONS.owner).toContain('admins.manage');
    expect(EVENT_ROLE_PERMISSIONS.admin).toContain('participants.manage');
    expect(EVENT_ROLE_PERMISSIONS.admin).toContain('timeline.manage');
    expect(EVENT_ROLE_PERMISSIONS.admin).not.toContain('event.delete');
    expect(EVENT_ROLE_PERMISSIONS.admin).not.toContain('admins.manage');
    expect(EVENT_ROLE_PERMISSIONS.viewer).toEqual([
      'event.read',
      'judges.read',
      'participants.read',
      'scores.read',
      'timeline.read',
    ]);
    expect(EVENT_ROLE_PERMISSIONS.viewer).not.toContain('participants.manage');
  });

  it('requireEventAdmin accetta owner evento', async () => {
    testState.user = {
      id: OWNER_ID,
    };

    await expect(requireEventAdmin(EVENT_ID)).resolves.toMatchObject({
      event: {
        id: EVENT_ID,
      },
      role: 'owner',
      user: {
        id: OWNER_ID,
      },
    });
  });

  it.each(['owner', 'admin'])('requireEventAdmin accetta role mutativo %s in event_admins', async (role) => {
    testState.user = {
      id: ADMIN_ID,
    };
    testState.eventAdmins.set(`${EVENT_ID}:${ADMIN_ID}`, {
      event_id: EVENT_ID,
      role,
      user_id: ADMIN_ID,
    });

    await expect(requireEventAdmin(EVENT_ID)).resolves.toMatchObject({
      role,
      user: {
        id: ADMIN_ID,
      },
    });
  });

  it('requireEventAdmin rifiuta viewer', async () => {
    testState.user = {
      id: ADMIN_ID,
    };
    testState.eventAdmins.set(`${EVENT_ID}:${ADMIN_ID}`, {
      event_id: EVENT_ID,
      role: 'viewer',
      user_id: ADMIN_ID,
    });

    await expect(requireEventAdmin(EVENT_ID)).rejects.toMatchObject({
      code: 'not_authorized',
    });
  });

  it('requireEventPermission riconosce viewer ma nega permessi mutativi', async () => {
    testState.user = {
      id: ADMIN_ID,
    };
    testState.eventAdmins.set(`${EVENT_ID}:${ADMIN_ID}`, {
      event_id: EVENT_ID,
      role: 'viewer',
      user_id: ADMIN_ID,
    });

    await expect(requireEventPermission(EVENT_ID, 'participants.read')).resolves.toMatchObject({
      permission: 'participants.read',
      role: 'viewer',
      user: {
        id: ADMIN_ID,
      },
    });
    await expect(requireEventPermission(EVENT_ID, 'participants.manage')).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  it('requireEventPermission dà precedenza a events.owner_id rispetto a event_admins', async () => {
    testState.user = {
      id: OWNER_ID,
    };
    testState.eventAdmins.set(`${EVENT_ID}:${OWNER_ID}`, {
      event_id: EVENT_ID,
      role: 'viewer',
      user_id: OWNER_ID,
    });

    await expect(requireEventPermission(EVENT_ID, 'event.delete')).resolves.toMatchObject({
      role: 'owner',
      user: {
        id: OWNER_ID,
      },
    });
  });

  it('requireEventPermission accetta admin sui permessi operativi ma non event.delete', async () => {
    testState.user = {
      id: ADMIN_ID,
    };
    testState.eventAdmins.set(`${EVENT_ID}:${ADMIN_ID}`, {
      event_id: EVENT_ID,
      role: 'admin',
      user_id: ADMIN_ID,
    });

    await expect(requireEventPermission(EVENT_ID, 'event.duplicate')).resolves.toMatchObject({
      role: 'admin',
    });
    await expect(requireEventPermission(EVENT_ID, 'event.delete')).rejects.toMatchObject({
      code: 'permission_denied',
    });
  });

  it('requireEventPermission usa client autenticato e non service role su successo', async () => {
    testState.user = {
      id: ADMIN_ID,
    };
    testState.eventAdmins.set(`${EVENT_ID}:${ADMIN_ID}`, {
      event_id: EVENT_ID,
      role: 'admin',
      user_id: ADMIN_ID,
    });

    await expect(requireEventPermission(EVENT_ID, 'participants.manage')).resolves.toMatchObject({
      permission: 'participants.manage',
      role: 'admin',
    });
    expect(testState.serviceClientCalls).toBe(0);
  });

  it('requireEventPermission rifiuta ruolo non valido', async () => {
    testState.user = {
      id: ADMIN_ID,
    };
    testState.eventAdmins.set(`${EVENT_ID}:${ADMIN_ID}`, {
      event_id: EVENT_ID,
      role: 'super_admin',
      user_id: ADMIN_ID,
    });

    await expect(requireEventPermission(EVENT_ID, 'event.read')).rejects.toMatchObject({
      code: 'invalid_role',
    });
  });

  it('requireEventAdmin rifiuta utente esterno', async () => {
    testState.user = {
      id: OUTSIDER_ID,
    };

    await expect(requireEventAdmin(EVENT_ID)).rejects.toMatchObject({
      code: 'event_not_found',
    });
  });

  it('requireEventAdmin rifiuta evento inesistente', async () => {
    testState.user = {
      id: OWNER_ID,
    };

    await expect(requireEventAdmin('55555555-5555-4555-8555-555555555555')).rejects.toMatchObject({
      code: 'event_not_found',
    });
  });

  it('requireEventAdminByRouteId risolve slug solo dopo utente autenticato', async () => {
    testState.user = {
      id: OWNER_ID,
    };

    await expect(requireEventAdminByRouteId('hitrace60-test')).resolves.toMatchObject({
      event: {
        id: EVENT_ID,
      },
    });
  });

  it('requireEventPermissionByRouteId risolve slug e verifica permesso', async () => {
    testState.user = {
      id: OWNER_ID,
    };

    await expect(requireEventPermissionByRouteId('hitrace60-test', 'timeline.manage')).resolves.toMatchObject({
      event: {
        id: EVENT_ID,
      },
      permission: 'timeline.manage',
      role: 'owner',
    });
  });

  it('requireEventPermissionByRouteId non usa service role per risolvere slug', async () => {
    testState.user = {
      id: ADMIN_ID,
    };
    testState.eventAdmins.set(`${EVENT_ID}:${ADMIN_ID}`, {
      event_id: EVENT_ID,
      role: 'admin',
      user_id: ADMIN_ID,
    });

    await expect(requireEventPermissionByRouteId('hitrace60-test', 'event.update_status')).resolves.toMatchObject({
      permission: 'event.update_status',
      role: 'admin',
    });
    expect(testState.serviceClientCalls).toBe(0);
  });

  it('requireEventPermissionByRouteId non rivela eventi non autorizzati', async () => {
    testState.user = {
      id: OUTSIDER_ID,
    };

    await expect(requireEventPermissionByRouteId('hitrace60-test', 'event.read')).rejects.toMatchObject({
      code: 'event_not_found',
    });
    expect(testState.serviceClientCalls).toBe(0);
  });

  it('requireEventPermission non usa service role prima di auth', async () => {
    testState.user = null;

    await expect(requireEventPermission(EVENT_ID, 'event.read')).rejects.toMatchObject({
      code: 'not_authenticated',
    });
    expect(testState.serviceClientCalls).toBe(0);
  });

  it('requireEventOperation consente delete solo su draft e published', () => {
    expect(() => requireEventOperation(contextWithStatus('draft'), 'delete_event')).not.toThrow();
    expect(() => requireEventOperation(contextWithStatus('published'), 'delete_event')).not.toThrow();
    expect(() => requireEventOperation(contextWithStatus('live'), 'delete_event')).toThrow(AdminActionError);
    expect(() => requireEventOperation(contextWithStatus('completed'), 'delete_event')).toThrow(AdminActionError);
    expect(() => requireEventOperation(contextWithStatus('archived'), 'delete_event')).toThrow(AdminActionError);
  });

  it('requireEventOperation consente manage_participants solo su draft e published', () => {
    expect(() => requireEventOperation(contextWithStatus('draft'), 'manage_participants')).not.toThrow();
    expect(() => requireEventOperation(contextWithStatus('published'), 'manage_participants')).not.toThrow();
    expect(() => requireEventOperation(contextWithStatus('live'), 'manage_participants')).toThrow(AdminActionError);
    expect(() => requireEventOperation(contextWithStatus('completed'), 'manage_participants')).toThrow(AdminActionError);
    expect(() => requireEventOperation(contextWithStatus('archived'), 'manage_participants')).toThrow(AdminActionError);
  });

  it('requireEventOperation consente manage_judges solo su draft e published', () => {
    expect(() => requireEventOperation(contextWithStatus('draft'), 'manage_judges')).not.toThrow();
    expect(() => requireEventOperation(contextWithStatus('published'), 'manage_judges')).not.toThrow();
    expect(() => requireEventOperation(contextWithStatus('live'), 'manage_judges')).toThrow(AdminActionError);
    expect(() => requireEventOperation(contextWithStatus('completed'), 'manage_judges')).toThrow(AdminActionError);
    expect(() => requireEventOperation(contextWithStatus('archived'), 'manage_judges')).toThrow(AdminActionError);
  });

  it('requireEventOperation consente manage_timeline solo su draft e published', () => {
    expect(() => requireEventOperation(contextWithStatus('draft'), 'manage_timeline')).not.toThrow();
    expect(() => requireEventOperation(contextWithStatus('published'), 'manage_timeline')).not.toThrow();
    expect(() => requireEventOperation(contextWithStatus('live'), 'manage_timeline')).toThrow(AdminActionError);
    expect(() => requireEventOperation(contextWithStatus('completed'), 'manage_timeline')).toThrow(AdminActionError);
    expect(() => requireEventOperation(contextWithStatus('archived'), 'manage_timeline')).toThrow(AdminActionError);
  });

  it('requireEventOperation applica transizioni stato esplicite', () => {
    expect(() => requireEventOperation(contextWithStatus('draft'), 'update_event_status', 'published')).not.toThrow();
    expect(() => requireEventOperation(contextWithStatus('published'), 'update_event_status', 'live')).not.toThrow();
    expect(() => requireEventOperation(contextWithStatus('live'), 'update_event_status', 'completed')).not.toThrow();
    expect(() => requireEventOperation(contextWithStatus('completed'), 'update_event_status', 'archived')).not.toThrow();
    expect(() => requireEventOperation(contextWithStatus('draft'), 'update_event_status', 'live')).toThrow(AdminActionError);
    expect(() => requireEventOperation(contextWithStatus('archived'), 'update_event_status', 'draft')).toThrow(AdminActionError);
  });
});

function contextWithStatus(status: EventStatus) {
  return {
    event: {
      id: EVENT_ID,
      ownerId: OWNER_ID,
      slug: 'hitrace60-test',
      status,
    },
    role: 'owner' as const,
    user: {
      email: 'admin@hitrace60.it',
      id: OWNER_ID,
    },
  };
}

function createServiceClientMock() {
  return {
    from(table: string) {
      const filters = new Map<string, string>();

      const query = {
        eq(column: string, value: string) {
          filters.set(column, value);
          return query;
        },
        async insert() {
          return {
            error: null,
          };
        },
        async maybeSingle() {
          if (table === 'events') {
            const id = filters.get('id');
            const slug = filters.get('slug');
            const row = id
              ? testState.events.get(id)
              : [...testState.events.values()].find((event) => event.slug === slug);

            return {
              data: row ?? null,
              error: null,
            };
          }

          if (table === 'event_admins') {
            const eventId = filters.get('event_id');
            const userId = filters.get('user_id');
            const row = eventId && userId ? testState.eventAdmins.get(`${eventId}:${userId}`) : null;

            return {
              data: row ?? null,
              error: null,
            };
          }

          if (table === 'profiles') {
            return {
              data: null,
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
        async upsert() {
          return {
            error: null,
          };
        },
      };

      return query;
    },
  };
}
