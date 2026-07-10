import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import AdminLayout from '../src/app/admin/layout.tsx';
import { logoutAdminAction } from '../src/app/admin/actions.ts';

const authMocks = vi.hoisted(() => ({
  authConfig: true,
  redirect: vi.fn((target: string) => {
    throw new Error(`NEXT_REDIRECT:${target}`);
  }),
  signOut: vi.fn(async () => undefined),
  user: null as { email: string; id: string } | null,
}));

vi.mock('next/navigation', () => ({
  redirect: authMocks.redirect,
}));

vi.mock('../src/lib/supabase/server.ts', () => ({
  hasSupabaseAuthConfig: () => authMocks.authConfig,
}));

vi.mock('../src/lib/supabase/auth-server.ts', () => ({
  createSupabaseUserServerClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: authMocks.user,
        },
      })),
      signOut: authMocks.signOut,
    },
  })),
}));

describe('admin layout auth guard', () => {
  const children = React.createElement('div', null, 'contenuto admin');

  it('redirige a login senza utente e non renderizza children', async () => {
    authMocks.authConfig = true;
    authMocks.user = null;

    await expect(AdminLayout({ children })).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('fallisce chiuso se Supabase Auth non e configurato', async () => {
    authMocks.authConfig = false;
    authMocks.user = null;

    await expect(AdminLayout({ children })).rejects.toThrow(
      'NEXT_REDIRECT:/login?error=auth_config_missing',
    );
  });

  it('renderizza il layout solo con utente valido', async () => {
    authMocks.authConfig = true;
    authMocks.user = {
      email: 'admin@hitrace60.it',
      id: 'user-1',
    };

    await expect(AdminLayout({ children })).resolves.toBeTruthy();
  });

  it('logout chiama signOut e redirige a login', async () => {
    authMocks.authConfig = true;
    authMocks.user = {
      email: 'admin@hitrace60.it',
      id: 'user-1',
    };
    authMocks.signOut.mockClear();

    await expect(logoutAdminAction()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(authMocks.signOut).toHaveBeenCalledTimes(1);
  });
});
