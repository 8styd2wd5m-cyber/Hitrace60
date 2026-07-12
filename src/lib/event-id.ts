import { HITRACE_JUDGE_TOKENS_BY_STATION_SLUG } from './constants.ts';
import { isDemoFallbackAllowed } from './demo-fallback.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from './supabase/server.ts';

export const SEEDED_SUPABASE_DEMO_EVENT_ID = '10000000-0000-0000-0000-000000000001';
export const LOCAL_DEMO_EVENT_ALIAS = 'demo-event';
export const LEGACY_DEMO_JUDGE_TOKENS = ['demo-token', 'demo-echo-bike', 'demo-multi-station'] as const;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const knownJudgeTokens = new Set<string>([
  ...Object.values(HITRACE_JUDGE_TOKENS_BY_STATION_SLUG),
  ...LEGACY_DEMO_JUDGE_TOKENS,
]);

export function resolveSupabaseEventId(eventId: string): string {
  return isDemoFallbackAllowed() && eventId === LOCAL_DEMO_EVENT_ALIAS ? SEEDED_SUPABASE_DEMO_EVENT_ID : eventId;
}

export async function resolveEventIdOrSlug(input: string): Promise<string | null> {
  if (isDemoFallbackAllowed() && input === LOCAL_DEMO_EVENT_ALIAS) {
    return SEEDED_SUPABASE_DEMO_EVENT_ID;
  }

  if (isUuid(input)) {
    return input;
  }

  if (!hasSupabaseServerConfig() || isKnownJudgeToken(input)) {
    return null;
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from('events').select('id').eq('slug', input).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function isKnownJudgeToken(value: string): boolean {
  return knownJudgeTokens.has(value) || (value.startsWith('judge-') && value.endsWith('-demo-token'));
}

export function getAdminEventRedirectForMistakenJudgeToken(value: string): string | null {
  return isDemoFallbackAllowed() && isKnownJudgeToken(value) ? LOCAL_DEMO_EVENT_ALIAS : null;
}
