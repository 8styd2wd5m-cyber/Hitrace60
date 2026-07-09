import { resolveEventIdOrSlug } from './event-id.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from './supabase/server.ts';
import type { EventStatus } from './types.ts';

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  archived: 'Archived',
  completed: 'Completed',
  draft: 'Draft',
  live: 'Live',
  published: 'Published',
};

export function canEditOperationalData(status: EventStatus): boolean {
  return status !== 'completed' && status !== 'archived';
}

export function canJudgeSubmitScores(status: EventStatus): boolean {
  return status === 'live';
}

export async function loadEventStatus(routeEventId: string): Promise<EventStatus> {
  if (!hasSupabaseServerConfig()) {
    return 'live';
  }

  const eventId = await resolveEventIdOrSlug(routeEventId);

  if (!eventId) {
    throw new Error(`Evento "${routeEventId}" non trovato.`);
  }

  return loadEventStatusById(eventId);
}

export async function loadEventStatusById(eventId: string): Promise<EventStatus> {
  if (!hasSupabaseServerConfig()) {
    return 'live';
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from('events').select('status').eq('id', eventId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(`Evento "${eventId}" non trovato.`);
  }

  return data.status as EventStatus;
}

export async function assertOperationalWriteAllowed(eventId: string): Promise<string | null> {
  const status = await loadEventStatusById(eventId);

  if (status === 'archived') {
    return 'Edizione archiviata: modifiche operative bloccate.';
  }

  if (status === 'completed') {
    return 'Edizione conclusa: modifiche operative bloccate in MVP.';
  }

  return null;
}

export async function assertJudgeWriteAllowed(eventId: string): Promise<string | null> {
  const status = await loadEventStatusById(eventId);

  if (canJudgeSubmitScores(status)) {
    return null;
  }

  if (status === 'completed' || status === 'archived') {
    return 'La gara e conclusa.';
  }

  return 'La gara non e ancora live.';
}
