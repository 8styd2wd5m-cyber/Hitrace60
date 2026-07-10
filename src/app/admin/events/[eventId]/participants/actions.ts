'use server';

import { revalidatePath } from 'next/cache';
import { requireEventOperation, requireEventPermissionByRouteId } from '@/lib/auth/action-auth.ts';
import { getAdminActionErrorMessage } from '@/lib/auth/action-errors.ts';
import { isUuid } from '@/lib/event-id.ts';
import { participantInputSchema, validateParticipantInput, type ParticipantInput } from '@/lib/participants.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from '@/lib/supabase/server.ts';
import type { Category, Participant, ParticipantMember, ParticipantStatus } from '@/lib/types.ts';

export type SaveParticipantResult =
  | {
      ok: true;
      participant: Participant;
      members: ParticipantMember[];
    }
  | {
      ok: false;
      errors: string[];
    };

export type DeleteParticipantResult =
  | {
      ok: true;
      participantId: string;
    }
  | {
      ok: false;
      errors: string[];
    };

interface CategoryRow {
  id: string;
  event_id: string;
  code: Category['code'];
  name: string;
  type: Category['type'];
  team_size: 1 | 2 | 3;
  race_day: string | null;
  start_order: number;
}

interface ParticipantRow {
  id: string;
  event_id: string;
  category_id: string;
  display_name: string;
  bib_number: string | null;
  status: ParticipantStatus;
  seed_order: number;
}

interface ParticipantMemberRow {
  id: string;
  participant_id: string;
  first_name: string;
  last_name: string;
  gender: 'M' | 'F' | null;
  member_order: number;
}

export async function saveParticipantAction(routeEventId: string, input: ParticipantInput): Promise<SaveParticipantResult> {
  if (!hasSupabaseServerConfig()) {
    return { ok: false, errors: ['Supabase non configurato.'] };
  }

  const parsed = participantInputSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  if (!routeEventId.trim() || !isUuid(input.eventId) || !isUuid(input.categoryId) || (input.id && !isUuid(input.id))) {
    return { ok: false, errors: ['Dati partecipante non validi.'] };
  }

  const duplicateMemberError = getDuplicateMemberError(input);

  if (duplicateMemberError) {
    return { ok: false, errors: [duplicateMemberError] };
  }

  const adminContext = await getAuthorizedParticipantsContext(routeEventId);

  if (!adminContext.ok) {
    return { ok: false, errors: [adminContext.error] };
  }

  const eventId = adminContext.context.event.id;

  if (eventId !== input.eventId) {
    return { ok: false, errors: ['Evento non valido o non coerente.'] };
  }

  const supabase = createSupabaseServiceClient();
  const { data: categoryRows, error: categoriesError } = await supabase
    .from('categories')
    .select('id,event_id,code,name,type,team_size,race_day,start_order')
    .eq('event_id', eventId);

  if (categoriesError) {
    return { ok: false, errors: ['Categoria non valida.'] };
  }

  const categories = ((categoryRows ?? []) as CategoryRow[]).map(mapCategory);
  const selectedCategory = categories.find((category) => category.id === input.categoryId);

  if (!selectedCategory || selectedCategory.eventId !== eventId) {
    return { ok: false, errors: ['Categoria non valida.'] };
  }

  if (input.id) {
    const existingParticipant = await loadAuthorizedParticipant(supabase, input.id, eventId);

    if (!existingParticipant.ok) {
      return { ok: false, errors: [existingParticipant.error] };
    }
  }

  const validation = validateParticipantInput(input, categories);

  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const isUpdate = Boolean(input.id);
  const participantRow = {
    event_id: eventId,
    category_id: input.categoryId,
    display_name: input.displayName.trim(),
    bib_number: input.bibNumber?.trim() || null,
    status: 'registered' as const,
    seed_order: input.seedOrder,
  };
  const result = input.id
    ? await supabase.from('participants').update(participantRow).eq('id', input.id).eq('event_id', eventId).select().single()
    : await supabase.from('participants').insert(participantRow).select().single();

  if (result.error || !result.data) {
    return { ok: false, errors: ['Salvataggio partecipante non riuscito.'] };
  }

  const participant = mapParticipant(result.data as ParticipantRow);
  const { error: deleteMembersError } = await supabase.from('participant_members').delete().eq('participant_id', participant.id);

  if (deleteMembersError) {
    return { ok: false, errors: ['Aggiornamento membri non riuscito.'] };
  }

  const memberRows = input.members.map((member, index) => ({
    participant_id: participant.id,
    first_name: member.firstName.trim(),
    last_name: member.lastName.trim(),
    gender: member.gender,
    member_order: index + 1,
  }));
  const { data: savedMemberRows, error: membersError } = await supabase
    .from('participant_members')
    .insert(memberRows)
    .select('id,participant_id,first_name,last_name,gender,member_order');

  if (membersError) {
    return { ok: false, errors: ['Salvataggio membri non riuscito.'] };
  }

  await writeParticipantAuditLog({
    action: isUpdate ? 'updated' : 'created',
    actorUserId: adminContext.context.user.id,
    eventId,
    participant,
    supabase,
  });

  revalidateAdminEventPaths(routeEventId);

  return {
    ok: true,
    participant,
    members: ((savedMemberRows ?? []) as ParticipantMemberRow[]).map(mapMember),
  };
}

export async function deleteParticipantAction(routeEventId: string, eventId: string, participantId: string): Promise<DeleteParticipantResult> {
  if (!hasSupabaseServerConfig()) {
    return { ok: false, errors: ['Supabase non configurato.'] };
  }

  if (!routeEventId.trim() || !isUuid(eventId) || !isUuid(participantId)) {
    return { ok: false, errors: ['Dati partecipante non validi.'] };
  }

  const adminContext = await getAuthorizedParticipantsContext(routeEventId);

  if (!adminContext.ok) {
    return { ok: false, errors: [adminContext.error] };
  }

  if (adminContext.context.event.id !== eventId) {
    return { ok: false, errors: ['Evento non valido o non coerente.'] };
  }

  const supabase = createSupabaseServiceClient();
  const existingParticipant = await loadAuthorizedParticipant(supabase, participantId, eventId);

  if (!existingParticipant.ok) {
    return { ok: false, errors: [existingParticipant.error] };
  }

  const { error } = await supabase.from('participants').delete().eq('id', participantId).eq('event_id', eventId);

  if (error) {
    return { ok: false, errors: ['Eliminazione partecipante non riuscita.'] };
  }

  await writeParticipantAuditLog({
    action: 'deleted',
    actorUserId: adminContext.context.user.id,
    eventId,
    participant: mapParticipant(existingParticipant.participant),
    supabase,
  });

  revalidateAdminEventPaths(routeEventId);

  return {
    ok: true,
    participantId,
  };
}

type AuthorizedParticipantsContextResult =
  | {
      ok: true;
      context: Awaited<ReturnType<typeof requireEventPermissionByRouteId>>;
    }
  | {
      ok: false;
      error: string;
    };

async function getAuthorizedParticipantsContext(routeEventId: string): Promise<AuthorizedParticipantsContextResult> {
  try {
    const context = await requireEventPermissionByRouteId(routeEventId, 'participants.manage');
    requireEventOperation(context, 'manage_participants');

    return {
      ok: true,
      context,
    };
  } catch (error) {
    return {
      ok: false,
      error: getAdminActionErrorMessage(error),
    };
  }
}

type AuthorizedParticipantLookupResult =
  | {
      ok: true;
      participant: ParticipantRow;
    }
  | {
      ok: false;
      error: string;
    };

async function loadAuthorizedParticipant(
  supabase: ReturnType<typeof createSupabaseServiceClient>,
  participantId: string,
  eventId: string,
): Promise<AuthorizedParticipantLookupResult> {
  const { data, error } = await supabase
    .from('participants')
    .select('id,event_id,category_id,display_name,bib_number,status,seed_order')
    .eq('id', participantId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: 'Partecipante non trovato.' };
  }

  const participant = data as ParticipantRow;

  if (participant.event_id !== eventId) {
    return { ok: false, error: 'Partecipante non trovato.' };
  }

  return {
    ok: true,
    participant,
  };
}

async function writeParticipantAuditLog(input: {
  action: 'created' | 'deleted' | 'updated';
  actorUserId: string;
  eventId: string;
  participant: Participant;
  supabase: ReturnType<typeof createSupabaseServiceClient>;
}): Promise<void> {
  await input.supabase.from('audit_logs').insert({
    event_id: input.eventId,
    entity_type: 'participant',
    entity_id: input.participant.id,
    action: input.action,
    actor_user_id: input.actorUserId,
    new_data:
      input.action === 'deleted'
        ? null
        : {
            category_id: input.participant.categoryId,
            display_name: input.participant.displayName,
            seed_order: input.participant.seedOrder,
          },
    old_data:
      input.action === 'deleted'
        ? {
            category_id: input.participant.categoryId,
            display_name: input.participant.displayName,
            seed_order: input.participant.seedOrder,
          }
        : null,
    reason: `Gestione partecipante da area admin: ${input.action}`,
  });
}

function revalidateAdminEventPaths(routeEventId: string) {
  revalidatePath('/admin/events');
  revalidatePath(`/admin/events/${routeEventId}`);
  revalidatePath(`/admin/events/${routeEventId}/participants`);
  revalidatePath(`/admin/events/${routeEventId}/timeline`);
  revalidatePath(`/display/${routeEventId}`);
}

function getDuplicateMemberError(input: ParticipantInput): string | null {
  const memberKeys = new Set<string>();

  for (const member of input.members) {
    const memberKey = `${member.firstName.trim().toLowerCase()}|${member.lastName.trim().toLowerCase()}|${member.gender}`;

    if (memberKeys.has(memberKey)) {
      return 'Membri duplicati non validi.';
    }

    memberKeys.add(memberKey);
  }

  return null;
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    eventId: row.event_id,
    code: row.code,
    name: row.name,
    type: row.type,
    teamSize: row.team_size,
    raceDay: row.race_day,
    startOrder: row.start_order,
  };
}

function mapParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    eventId: row.event_id,
    categoryId: row.category_id,
    displayName: row.display_name,
    bibNumber: row.bib_number,
    status: row.status,
    seedOrder: row.seed_order,
  };
}

function mapMember(row: ParticipantMemberRow): ParticipantMember {
  return {
    id: row.id,
    participantId: row.participant_id,
    firstName: row.first_name,
    lastName: row.last_name,
    gender: row.gender,
    memberOrder: row.member_order,
  };
}
