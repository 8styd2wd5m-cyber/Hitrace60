'use server';

import { sanitizeAdminRedirect } from '@/lib/auth-redirect.ts';
import { createSupabaseUserServerClient } from '@/lib/supabase/auth-server.ts';
import { hasSupabaseAuthConfig } from '@/lib/supabase/server.ts';

export interface LoginAdminInput {
  email: string;
  password: string;
  redirectTo?: string;
}

export type LoginAdminResult =
  | {
      ok: true;
      redirectTo: string;
    }
  | {
      ok: false;
      error: string;
    };

export async function loginAdminAction(input: LoginAdminInput): Promise<LoginAdminResult> {
  if (!hasSupabaseAuthConfig()) {
    return {
      ok: false,
      error: 'Supabase Auth non configurato. Imposta URL e anon key.',
    };
  }

  const email = input.email.trim().toLowerCase();

  if (!email || !input.password) {
    return {
      ok: false,
      error: 'Inserisci email e password.',
    };
  }

  const supabase = await createSupabaseUserServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (error) {
    return {
      ok: false,
      error: 'Credenziali non valide.',
    };
  }

  return {
    ok: true,
    redirectTo: sanitizeAdminRedirect(input.redirectTo),
  };
}
