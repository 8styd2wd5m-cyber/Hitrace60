import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaderState = vi.hoisted(() => ({
  authConfig: true,
  counts: new Map<string, number>(),
  serviceClientCalls: 0,
  userClientCalls: 0,
  unauthorizedEvent: false,
}));

const EVENT_ID = '11111111-1111-4111-8111-111111111111';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(async (value: string) => `qr:${value}`),
  },
}));

vi.mock('@/lib/supabase/auth-server.ts', () => ({
  createSupabaseUserServerClient: vi.fn(async () => {
    loaderState.userClientCalls += 1;
    return createClientMock();
  }),
}));

vi.mock('@/lib/supabase/server.ts', () => ({
  createSupabaseServiceClient: vi.fn(() => {
    loaderState.serviceClientCalls += 1;
    return createClientMock();
  }),
  hasSupabaseAuthConfig: () => loaderState.authConfig,
  hasSupabaseServerConfig: () => loaderState.authConfig,
  hasSupabaseServiceConfig: () => loaderState.authConfig,
}));

describe('admin read-only loaders use authenticated RLS client', () => {
  beforeEach(() => {
    loaderState.authConfig = true;
    loaderState.counts = new Map([
      ['categories', 7],
      ['heats', 2],
      ['judge_station_assignments', 8],
      ['judges', 8],
      ['participants', 2],
      ['scores', 1],
      ['stations', 8],
    ]);
    loaderState.serviceClientCalls = 0;
    loaderState.unauthorizedEvent = false;
    loaderState.userClientCalls = 0;
  });

  it('i loader admin migrati non importano createSupabaseServiceClient', () => {
    for (const file of [
      'src/lib/events-data.ts',
      'src/lib/participants-data.ts',
      'src/lib/timeline-data.ts',
      'src/lib/event-links.ts',
    ]) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');

      expect(source).not.toContain('createSupabaseServiceClient');
      expect(source).toContain('createSupabaseUserServerClient');
    }
  });

  it('listAdminEvents usa il client autenticato e non la service role', async () => {
    const { listAdminEvents } = await import('../src/lib/events-data.ts');

    const events = await listAdminEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: EVENT_ID,
      routeId: 'hitrace60-test',
    });
    expect(loaderState.userClientCalls).toBe(1);
    expect(loaderState.serviceClientCalls).toBe(0);
  });

  it('loadAdminEventOverview usa RLS e non ricade su demo se evento non autorizzato', async () => {
    const { loadAdminEventOverview } = await import('../src/lib/events-data.ts');

    loaderState.unauthorizedEvent = true;
    const result = await loadAdminEventOverview('hitrace60-test');

    expect(result.status).toBe('not_found');
    expect(JSON.stringify(result)).not.toContain('Fallback demo');
    expect(loaderState.userClientCalls).toBe(1);
    expect(loaderState.serviceClientCalls).toBe(0);
  });

  it('loadParticipantsAdminData legge categorie, partecipanti e membri con client autenticato', async () => {
    const { loadParticipantsAdminData } = await import('../src/lib/participants-data.ts');

    const data = await loadParticipantsAdminData('hitrace60-test');

    expect(data.source).toBe('supabase');
    expect(data.participants).toHaveLength(1);
    expect(data.members).toHaveLength(1);
    expect(loaderState.userClientCalls).toBe(1);
    expect(loaderState.serviceClientCalls).toBe(0);
  });

  it('loadParticipantsAdminData non usa fallback demo dopo negazione RLS', async () => {
    const { loadParticipantsAdminData } = await import('../src/lib/participants-data.ts');

    loaderState.unauthorizedEvent = true;

    await expect(loadParticipantsAdminData('hitrace60-test')).rejects.toThrow('Evento "hitrace60-test" non trovato');
    expect(loaderState.userClientCalls).toBe(1);
    expect(loaderState.serviceClientCalls).toBe(0);
  });

  it('loadTimelineAdminData usa client autenticato', async () => {
    const { loadTimelineAdminData } = await import('../src/lib/timeline-data.ts');

    const data = await loadTimelineAdminData('hitrace60-test');

    expect(data.source).toBe('supabase');
    expect(data.categories).toHaveLength(1);
    expect(data.participants).toHaveLength(1);
    expect(loaderState.userClientCalls).toBe(1);
    expect(loaderState.serviceClientCalls).toBe(0);
  });

  it('loadEventLinksData usa client autenticato e non espone assignment cross-event', async () => {
    const { loadEventLinksData } = await import('../src/lib/event-links.ts');

    const data = await loadEventLinksData('hitrace60-test');

    expect('redirectEventId' in data).toBe(false);
    if ('redirectEventId' in data) return;
    expect(data.source).toBe('supabase');
    expect(data.judgeLinks).toHaveLength(1);
    expect(data.judgeLinks[0]).toMatchObject({
      ready: true,
      token: 'judge-echo-bike-hitrace60-test-token',
    });
    expect(loaderState.userClientCalls).toBe(1);
    expect(loaderState.serviceClientCalls).toBe(0);
  });
});

function createClientMock() {
  return {
    from(table: string) {
      const filters = new Map<string, unknown>();
      const query = {
        eq(column: string, value: unknown) {
          filters.set(column, value);
          return query;
        },
        in(column: string, value: unknown) {
          filters.set(column, value);
          return query;
        },
        limit() {
          return query;
        },
        maybeSingle: async () => maybeSingleResult(table, filters),
        order() {
          return query;
        },
        select(_columns?: string, options?: { count?: 'exact'; head?: boolean }) {
          if (options?.head) {
            filters.set('__head', true);
          }
          return query;
        },
        then(resolve: (value: QueryResult) => void, reject: (reason?: unknown) => void) {
          return Promise.resolve(queryResult(table, filters)).then(resolve, reject);
        },
      };

      return query;
    },
  };
}

type QueryResult = {
  count?: number | null;
  data: unknown;
  error: null;
};

function maybeSingleResult(table: string, filters: Map<string, unknown>): QueryResult {
  if (table === 'events') {
    const event = eventRow();

    if (!event) {
      return { data: null, error: null };
    }

    if (filters.get('slug') === 'hitrace60-test' || filters.get('id') === EVENT_ID) {
      return {
        data: event,
        error: null,
      };
    }
  }

  if (table === 'scores') {
    return {
      data: {
        updated_at: '2026-09-10T08:05:00.000Z',
      },
      error: null,
    };
  }

  return { data: null, error: null };
}

function queryResult(table: string, filters: Map<string, unknown>): QueryResult {
  if (filters.get('__head')) {
    return {
      count: loaderState.counts.get(table) ?? 0,
      data: null,
      error: null,
    };
  }

  if (table === 'events') {
    const event = eventRow();
    return {
      data: event ? [event] : [],
      error: null,
    };
  }

  if (table === 'categories') {
    return {
      data: [
        {
          code: 'MM',
          event_id: EVENT_ID,
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Team MM',
          race_day: null,
          start_order: 1,
          team_size: 2,
          type: 'team_2',
        },
      ],
      error: null,
    };
  }

  if (table === 'participants') {
    return {
      data: [
        {
          bib_number: null,
          category_id: '22222222-2222-4222-8222-222222222222',
          display_name: 'Team Alpha',
          event_id: EVENT_ID,
          id: '33333333-3333-4333-8333-333333333333',
          seed_order: 1,
          status: 'registered',
        },
      ],
      error: null,
    };
  }

  if (table === 'participant_members') {
    return {
      data: [
        {
          first_name: 'Mario',
          gender: 'M',
          id: 'member-1',
          last_name: 'Rossi',
          member_order: 1,
          participant_id: '33333333-3333-4333-8333-333333333333',
        },
      ],
      error: null,
    };
  }

  if (table === 'stations') {
    return {
      data: [
        {
          active: true,
          id: '44444444-4444-4444-8444-444444444444',
          is_scored: true,
          name: 'Echo Bike',
          slug: 'echo-bike',
          station_order: 1,
        },
      ],
      error: null,
    };
  }

  if (table === 'judge_station_assignments') {
    return {
      data: [
        {
          active: true,
          id: 'assignment-1',
          qr_url: '/judge/judge-echo-bike-hitrace60-test-token',
          station_id: '44444444-4444-4444-8444-444444444444',
        },
      ],
      error: null,
    };
  }

  if (table === 'scores') {
    return {
      data: [
        {
          station_id: '44444444-4444-4444-8444-444444444444',
        },
      ],
      error: null,
    };
  }

  return {
    data: [],
    error: null,
  };
}

function eventRow() {
  if (loaderState.unauthorizedEvent) return null;

  return {
    edition_label: 'Settembre 2026',
    ends_at: '2026-09-10T18:00:00.000Z',
    id: EVENT_ID,
    location: 'Demo Arena',
    name: 'HITRACE60 Test',
    slug: 'hitrace60-test',
    starts_at: '2026-09-10T08:00:00.000Z',
    status: 'draft',
    timezone: 'Europe/Rome',
    updated_at: '2026-09-01T08:00:00.000Z',
  };
}
