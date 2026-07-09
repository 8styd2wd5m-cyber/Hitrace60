'use server';

import { revalidatePath } from 'next/cache';
import { assertOperationalWriteAllowed } from '@/lib/event-status.ts';
import { participantInputSchema, validateParticipantInput, type ParticipantInput } from '@/lib/participants.ts';
import { resolveEventIdOrSlug } from '@/lib/event-id.ts';
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

  const resolvedEventId = await resolveEventIdOrSlug(routeEventId);

  if (!resolvedEventId || resolvedEventId !== input.eventId) {
    return { ok: false, errors: ['Evento non valido o non coerente.'] };
  }

  const statusError = await assertOperationalWriteAllowed(resolvedEventId);

  if (statusError) {
    return { ok: false, errors: [statusError] };
  }

  const supabase = createSupabaseServiceClient();
  const { data: categoryRows, error: categoriesError } = await supabase
    .from('categories')
    .select('id,event_id,code,name,type,team_size,race_day,start_order')
    .eq('event_id', resolvedEventId);

  if (categoriesError) {
    return { ok: false, errors: [categoriesError.message] };
  }

  const categories = ((categoryRows ?? []) as CategoryRow[]).map(mapCategory);
  const validation = validateParticipantInput(input, categories);

  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const participantRow = {
    event_id: resolvedEventId,
    category_id: input.categoryId,
    display_name: input.displayName.trim(),
    bib_number: input.bibNumber?.trim() || null,
    status: 'registered' as const,
    seed_order: input.seedOrder,
  };
  const result = input.id
    ? await supabase.from('participants').update(participantRow).eq('id', input.id).eq('event_id', resolvedEventId).select().single()
    : await supabase.from('participants').insert(participantRow).select().single();

  if (result.error || !result.data) {
    return { ok: false, errors: [result.error?.message ?? 'Salvataggio partecipante non riuscito.'] };
  }

  const participant = mapParticipant(result.data as ParticipantRow);
  const { error: deleteMembersError } = await supabase.from('participant_members').delete().eq('participant_id', participant.id);

  if (deleteMembersError) {
    return { ok: false, errors: [deleteMembersError.message] };
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
    return { ok: false, errors: [membersError.message] };
  }

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

  const resolvedEventId = await resolveEventIdOrSlug(routeEventId);

  if (!resolvedEventId || resolvedEventId !== eventId) {
    return { ok: false, errors: ['Evento non valido o non coerente.'] };
  }

  const statusError = await assertOperationalWriteAllowed(resolvedEventId);

  if (statusError) {
    return { ok: false, errors: [statusError] };
  }

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from('participants').delete().eq('id', participantId).eq('event_id', resolvedEventId);

  if (error) {
    return { ok: false, errors: [error.message] };
  }

  revalidateAdminEventPaths(routeEventId);

  return {
    ok: true,
    participantId,
  };
}

function revalidateAdminEventPaths(routeEventId: string) {
  revalidatePath('/admin/events');
  revalidatePath(`/admin/events/${routeEventId}`);
  revalidatePath(`/admin/events/${routeEventId}/participants`);
  revalidatePath(`/admin/events/${routeEventId}/timeline`);
  revalidatePath(`/display/${routeEventId}`);
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
