import { demoCategories, demoParticipants } from './demo-data.ts';
import { resolveSupabaseEventId } from './event-id.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from './supabase/server.ts';
import type { Category, Participant, ParticipantStatus } from './types.ts';

export interface TimelineAdminData {
  categories: Category[];
  participants: Participant[];
  resolvedEventId: string;
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

export async function loadTimelineAdminData(eventId: string): Promise<TimelineAdminData> {
  if (!hasSupabaseServerConfig()) {
    return {
      categories: demoCategories.filter((category) => category.eventId === eventId),
      participants: demoParticipants.filter((participant) => participant.eventId === eventId),
      resolvedEventId: eventId,
      source: 'demo',
    };
  }

  const resolvedEventId = resolveSupabaseEventId(eventId);
  const supabase = createSupabaseServiceClient();
  const [categoriesResult, participantsResult] = await Promise.all([
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

  const firstError = categoriesResult.error ?? participantsResult.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    categories: ((categoriesResult.data ?? []) as CategoryRow[]).map(mapCategory),
    participants: ((participantsResult.data ?? []) as ParticipantRow[]).map(mapParticipant),
    resolvedEventId,
    source: 'supabase',
  };
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
