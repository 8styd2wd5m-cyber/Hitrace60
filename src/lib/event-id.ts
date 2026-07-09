export const SEEDED_SUPABASE_DEMO_EVENT_ID = '10000000-0000-0000-0000-000000000001';
export const LOCAL_DEMO_EVENT_ALIAS = 'demo-event';

export function resolveSupabaseEventId(eventId: string): string {
  return eventId === LOCAL_DEMO_EVENT_ALIAS ? SEEDED_SUPABASE_DEMO_EVENT_ID : eventId;
}
