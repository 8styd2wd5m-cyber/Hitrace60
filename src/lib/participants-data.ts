import { demoCategories, demoParticipantMembers, demoParticipants } from './demo-data.ts';
import { resolveEventIdOrSlug } from './event-id.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from './supabase/server.ts';
import type { Category, EventStatus, Participant, ParticipantMember, ParticipantStatus } from './types.ts';

export interface ParticipantsAdminData {
  categories: Category[];
  eventId: string;
  eventStatus: EventStatus;
  members: ParticipantMember[];
  participants: Participant[];
  source: 'supabase' | 'demo';
}

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

export async function loadParticipantsAdminData(routeEventId: string): Promise<ParticipantsAdminData> {
  if (!hasSupabaseServerConfig()) {
    const participants = demoParticipants.filter((participant) => participant.eventId === routeEventId);
    const participantIds = new Set(participants.map((participant) => participant.id));

    return {
      categories: demoCategories.filter((category) => category.eventId === routeEventId),
      eventId: routeEventId,
      eventStatus: 'live',
      members: demoParticipantMembers.filter((member) => participantIds.has(member.participantId)),
      participants,
      source: 'demo',
    };
  }

  const resolvedEventId = await resolveEventIdOrSlug(routeEventId);

  if (!resolvedEventId) {
    throw new Error(`Evento "${routeEventId}" non trovato`);
  }

  const supabase = createSupabaseServiceClient();
  const [eventResult, categoriesResult, participantsResult] = await Promise.all([
    supabase.from('events').select('status').eq('id', resolvedEventId).maybeSingle(),
    supabase
      .from('categories')
      .select('id,event_id,code,name,type,team_size,race_day,start_order')
      .eq('event_id', resolvedEventId)
      .order('start_order', { ascending: true }),
    supabase
      .from('participants')
      .select('id,event_id,category_id,display_name,bib_number,status,seed_order')
      .eq('event_id', resolvedEventId)
      .order('seed_order', { ascending: true }),
  ]);

  const firstError = eventResult.error ?? categoriesResult.error ?? participantsResult.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const participants = ((participantsResult.data ?? []) as ParticipantRow[]).map(mapParticipant);
  const participantIds = participants.map((participant) => participant.id);
  const members = participantIds.length ? await loadMembers(participantIds) : [];

  return {
    categories: ((categoriesResult.data ?? []) as CategoryRow[]).map(mapCategory),
    eventId: resolvedEventId,
    eventStatus: ((eventResult.data?.status as EventStatus | undefined) ?? 'draft'),
    members,
    participants,
    source: 'supabase',
  };
}

async function loadMembers(participantIds: string[]): Promise<ParticipantMember[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('participant_members')
    .select('id,participant_id,first_name,last_name,gender,member_order')
    .in('participant_id', participantIds)
    .order('member_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as ParticipantMemberRow[]).map((row) => ({
    id: row.id,
    participantId: row.participant_id,
    firstName: row.first_name,
    lastName: row.last_name,
    gender: row.gender,
    memberOrder: row.member_order,
  }));
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
