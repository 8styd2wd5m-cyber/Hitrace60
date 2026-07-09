'use server';

import { revalidatePath } from 'next/cache';
import { resolveEventIdOrSlug } from '@/lib/event-id.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from '@/lib/supabase/server.ts';
import type { EventStatus } from '@/lib/types.ts';

const allowedStatuses = new Set<EventStatus>(['draft', 'published', 'live', 'completed', 'archived']);

export interface UpdateEventStatusResult {
  ok: boolean;
  message: string;
  status?: EventStatus;
}

export async function updateEventStatusAction(routeEventId: string, nextStatus: EventStatus): Promise<UpdateEventStatusResult> {
  if (!hasSupabaseServerConfig()) {
    return { ok: false, message: 'Supabase non configurato.' };
  }

  if (!allowedStatuses.has(nextStatus)) {
    return { ok: false, message: 'Stato evento non valido.' };
  }

  const eventId = await resolveEventIdOrSlug(routeEventId);

  if (!eventId) {
    return { ok: false, message: 'Evento non trovato.' };
  }

  const supabase = createSupabaseServiceClient();
  const { data: currentEvent, error: currentError } = await supabase.from('events').select('id,status').eq('id', eventId).maybeSingle();

  if (currentError || !currentEvent) {
    return { ok: false, message: currentError?.message ?? 'Evento non trovato.' };
  }

  if ((currentEvent.status as EventStatus) === 'archived' && nextStatus !== 'archived') {
    return { ok: false, message: 'Edizione archiviata: lo stato non puo essere modificato da UI.' };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('events')
    .update({
      status: nextStatus,
      updated_at: now,
    })
    .eq('id', eventId);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  await supabase.from('audit_logs').insert({
    event_id: eventId,
    entity_type: 'event',
    entity_id: eventId,
    action: 'updated',
    old_data: {
      status: currentEvent.status,
    },
    new_data: {
      status: nextStatus,
    },
    reason: 'Cambio stato edizione da dashboard admin',
  });

  revalidatePath('/admin/events');
  revalidatePath(`/admin/events/${routeEventId}`);
  revalidatePath(`/display/${routeEventId}`);

  return {
    ok: true,
    message: `Stato aggiornato a ${nextStatus}.`,
    status: nextStatus,
  };
}
