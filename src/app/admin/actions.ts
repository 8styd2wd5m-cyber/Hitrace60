'use server';

import { redirect } from 'next/navigation';
import { createSupabaseUserServerClient } from '@/lib/supabase/auth-server.ts';
import { hasSupabaseAuthConfig } from '@/lib/supabase/server.ts';

export async function logoutAdminAction() {
  if (hasSupabaseAuthConfig()) {
    const supabase = await createSupabaseUserServerClient();
    await supabase.auth.signOut();
  }

  redirect('/login');
}
