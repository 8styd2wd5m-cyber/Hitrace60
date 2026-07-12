import { afterEach, describe, expect, it } from 'vitest';
import { isDemoFallbackAllowed } from '../src/lib/demo-fallback.ts';
import { DEMO_EVENT_ID, DEMO_SEEDED_JUDGE_TOKEN } from '../src/lib/demo-data.ts';
import { listAdminEvents } from '../src/lib/events-data.ts';
import { loadDisplayPageData } from '../src/lib/display-data.ts';
import { loadJudgePageData } from '../src/lib/judge-data.ts';
import { SEEDED_SUPABASE_DEMO_EVENT_ID, resolveEventIdOrSlug } from '../src/lib/event-id.ts';

const originalEnv = {
  allowDemoFallback: process.env.ALLOW_DEMO_FALLBACK,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
};

describe('demo fallback safety gate', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('consente fallback solo con valore esatto true', () => {
    process.env.ALLOW_DEMO_FALLBACK = 'true';
    expect(isDemoFallbackAllowed()).toBe(true);

    for (const value of ['false', 'TRUE', '1', 'yes', '']) {
      process.env.ALLOW_DEMO_FALLBACK = value;
      expect(isDemoFallbackAllowed()).toBe(false);
    }

    delete process.env.ALLOW_DEMO_FALLBACK;
    expect(isDemoFallbackAllowed()).toBe(false);
  });

  it('admin fallback spento non restituisce eventi demo senza Supabase Auth', async () => {
    disableSupabaseConfig();
    process.env.ALLOW_DEMO_FALLBACK = 'false';

    await expect(listAdminEvents()).resolves.toEqual([]);
  });

  it('admin fallback acceso consente esplicitamente eventi demo senza Supabase Auth', async () => {
    disableSupabaseConfig();
    process.env.ALLOW_DEMO_FALLBACK = 'true';

    const events = await listAdminEvents();

    expect(events).toHaveLength(1);
    expect(events[0]?.source).toBe('demo');
  });

  it('display fallback spento non inventa dati demo senza Supabase server config', async () => {
    disableSupabaseConfig();
    process.env.ALLOW_DEMO_FALLBACK = 'false';

    const data = await loadDisplayPageData(DEMO_EVENT_ID);

    expect(data.source).toBe('supabase');
    expect(data.categories).toEqual([]);
    expect(data.participants).toEqual([]);
    expect(data.scores).toEqual([]);
    expect(data.stations).toEqual([]);
  });

  it('alias demo-event non bypassa il gate fallback', async () => {
    disableSupabaseConfig();
    process.env.ALLOW_DEMO_FALLBACK = 'false';

    await expect(resolveEventIdOrSlug(DEMO_EVENT_ID)).resolves.toBeNull();

    process.env.ALLOW_DEMO_FALLBACK = 'true';

    await expect(resolveEventIdOrSlug(DEMO_EVENT_ID)).resolves.toBe(SEEDED_SUPABASE_DEMO_EVENT_ID);
  });

  it('display fallback acceso restituisce dati demo espliciti senza Supabase server config', async () => {
    disableSupabaseConfig();
    process.env.ALLOW_DEMO_FALLBACK = 'true';

    const data = await loadDisplayPageData(DEMO_EVENT_ID);

    expect(data.source).toBe('demo');
    expect(data.participants.length).toBeGreaterThan(0);
    expect(data.scores).toEqual([]);
  });

  it('judge token demo non funziona con fallback spento e Supabase mancante', async () => {
    disableSupabaseConfig();
    process.env.ALLOW_DEMO_FALLBACK = 'false';

    const result = await loadJudgePageData(DEMO_SEEDED_JUDGE_TOKEN);

    expect(result).toMatchObject({
      source: 'supabase',
      status: 'configuration_error',
    });
  });

  it('judge token demo funziona solo con fallback acceso', async () => {
    disableSupabaseConfig();
    process.env.ALLOW_DEMO_FALLBACK = 'true';

    const result = await loadJudgePageData(DEMO_SEEDED_JUDGE_TOKEN);

    expect(result).toMatchObject({
      source: 'demo',
      status: 'ready',
    });
  });
});

function disableSupabaseConfig() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function restoreEnv() {
  restoreEnvValue('ALLOW_DEMO_FALLBACK', originalEnv.allowDemoFallback);
  restoreEnvValue('NEXT_PUBLIC_SUPABASE_URL', originalEnv.supabaseUrl);
  restoreEnvValue('NEXT_PUBLIC_SUPABASE_ANON_KEY', originalEnv.anonKey);
  restoreEnvValue('SUPABASE_SERVICE_ROLE_KEY', originalEnv.serviceRoleKey);
}

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
