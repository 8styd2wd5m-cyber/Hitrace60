import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LOCAL_DEMO_EVENT_ALIAS,
  SEEDED_SUPABASE_DEMO_EVENT_ID,
  isKnownJudgeToken,
  isUuid,
} from './event-id.ts';
import { createSupabaseUserServerClient } from './supabase/auth-server.ts';
import { hasSupabaseAuthConfig } from './supabase/server.ts';

export async function resolveAdminEventIdOrSlug(input: string, supabase?: SupabaseClient): Promise<string | null> {
  if (input === LOCAL_DEMO_EVENT_ALIAS) {
    return SEEDED_SUPABASE_DEMO_EVENT_ID;
  }

  if (isUuid(input)) {
    return input;
  }

  if (!hasSupabaseAuthConfig() || isKnownJudgeToken(input)) {
    return null;
  }

  const client = supabase ?? (await createSupabaseUserServerClient());
  const { data, error } = await client.from('events').select('id').eq('slug', input).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}
