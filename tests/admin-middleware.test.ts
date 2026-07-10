import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { middleware } from '../middleware.ts';

const authState = vi.hoisted(() => ({
  user: null as { email: string; id: string } | null,
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: authState.user,
        },
      })),
    },
  })),
}));

describe('admin middleware auth guard', () => {
  beforeEach(() => {
    authState.user = null;
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('NODE_ENV', 'development');
  });

  it.each(['/admin', '/admin/events'])('redirige route admin anonima: %s', async (path) => {
    const response = await middleware(nextRequest(path));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain(`/login?redirectTo=${encodeURIComponent(path)}`);
  });

  it('fallisce chiuso su route admin anche se manca la config auth in development', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const response = await middleware(nextRequest('/admin/events'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/login');
    expect(response.headers.get('location')).toContain('auth_config_missing');
  });

  it('consente route admin con utente autenticato', async () => {
    authState.user = {
      email: 'admin@hitrace60.it',
      id: 'user-1',
    };

    const response = await middleware(nextRequest('/admin/events'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('lascia accessibile login agli anonimi', async () => {
    const response = await middleware(nextRequest('/login'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirige login autenticato verso route admin sanitizzata', async () => {
    authState.user = {
      email: 'admin@hitrace60.it',
      id: 'user-1',
    };

    const response = await middleware(nextRequest('/login?redirectTo=/admin/events/demo-event'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/admin/events/demo-event');
  });

  it.each(['/judge/judge-echo-bike-demo-token', '/display/demo-event'])('mantiene pubblica la route %s', async (path) => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

    const response = await middleware(nextRequest(path));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});

function nextRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://127.0.0.1:3000'));
}
