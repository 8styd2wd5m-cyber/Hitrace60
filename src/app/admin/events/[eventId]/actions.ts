'use server';

import { revalidatePath } from 'next/cache';
import { requireEventAdminByRouteId, requireEventOperation } from '@/lib/auth/action-auth.ts';
import { getAdminActionErrorMessage } from '@/lib/auth/action-errors.ts';
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

  const adminContext = await getAuthorizedStatusUpdateContext(routeEventId, nextStatus);

  if (!adminContext.ok) {
    return { ok: false, message: adminContext.message };
  }

  if (adminContext.context.event.status === nextStatus) {
    return {
      ok: true,
      message: `Stato già impostato a ${nextStatus}.`,
      status: nextStatus,
    };
  }

  const eventId = adminContext.context.event.id;
  const supabase = createSupabaseServiceClient();
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
    actor_user_id: adminContext.context.user.id,
    old_data: {
      status: adminContext.context.event.status,
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

type AuthorizedStatusUpdateContextResult =
  | {
      ok: true;
      context: Awaited<ReturnType<typeof requireEventAdminByRouteId>>;
    }
  | {
      ok: false;
      message: string;
    };

async function getAuthorizedStatusUpdateContext(
  routeEventId: string,
  nextStatus: EventStatus,
): Promise<AuthorizedStatusUpdateContextResult> {
  try {
    const context = await requireEventAdminByRouteId(routeEventId);
    requireEventOperation(context, 'update_event_status', nextStatus);

    return {
      ok: true,
      context,
    };
  } catch (error) {
    return {
      ok: false,
      message: getAdminActionErrorMessage(error),
    };
  }
}
