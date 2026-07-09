import { demoCategories, demoHeats, demoParticipants, demoStations } from './demo-data.ts';
import {
  LOCAL_DEMO_EVENT_ALIAS,
  getAdminEventRedirectForMistakenJudgeToken,
  isUuid,
  resolveSupabaseEventId,
} from './event-id.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from './supabase/server.ts';
import type { EventStatus } from './types.ts';

export interface AdminEventOverview {
  id: string;
  routeId: string;
  name: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: EventStatus;
  source: 'supabase' | 'demo';
  counts: {
    categories: number;
    heats: number;
    judges: number;
    participants: number;
    scores: number;
    stations: number;
  };
}

export interface AdminEventListItem {
  id: string;
  routeId: string;
  name: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: EventStatus;
  source: 'supabase' | 'demo';
}

export type AdminEventLookupResult =
  | {
      status: 'ready';
      event: AdminEventOverview;
    }
  | {
      status: 'redirect';
      eventId: string;
    }
  | {
      status: 'not_found';
      message: string;
    };

interface EventRow {
  id: string;
  name: string;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: EventStatus;
}

export async function listAdminEvents(): Promise<AdminEventListItem[]> {
  if (!hasSupabaseServerConfig()) {
    return [
      {
        id: LOCAL_DEMO_EVENT_ALIAS,
        routeId: LOCAL_DEMO_EVENT_ALIAS,
        name: 'HITRACE60 Demo Event',
        location: 'Demo Arena',
        startsAt: '2026-07-07T08:00:00+02:00',
        endsAt: '2026-07-07T18:00:00+02:00',
        status: 'live',
        source: 'demo',
      },
    ];
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('events')
    .select('id,name,location,starts_at,ends_at,status')
    .order('starts_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as EventRow[]).map((event) => ({
    id: event.id,
    routeId: event.id === resolveSupabaseEventId(LOCAL_DEMO_EVENT_ALIAS) ? LOCAL_DEMO_EVENT_ALIAS : event.id,
    name: event.name,
    location: event.location,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    status: event.status,
    source: 'supabase',
  }));
}

export async function loadAdminEventOverview(routeEventId: string): Promise<AdminEventLookupResult> {
  const redirectEventId = getAdminEventRedirectForMistakenJudgeToken(routeEventId);

  if (redirectEventId) {
    return {
      status: 'redirect',
      eventId: redirectEventId,
    };
  }

  if (!hasSupabaseServerConfig()) {
    if (routeEventId !== LOCAL_DEMO_EVENT_ALIAS) {
      return {
        status: 'not_found',
        message: `Evento "${routeEventId}" non trovato nel fallback demo.`,
      };
    }

    return {
      status: 'ready',
      event: {
        id: LOCAL_DEMO_EVENT_ALIAS,
        routeId: LOCAL_DEMO_EVENT_ALIAS,
        name: 'HITRACE60 Demo Event',
        location: 'Demo Arena',
        startsAt: '2026-07-07T08:00:00+02:00',
        endsAt: '2026-07-07T18:00:00+02:00',
        status: 'live',
        source: 'demo',
        counts: {
          categories: demoCategories.length,
          heats: demoHeats.length,
          judges: demoStations.filter((station) => station.isScored).length,
          participants: demoParticipants.length,
          scores: 0,
          stations: demoStations.filter((station) => station.isScored).length,
        },
      },
    };
  }

  const resolvedEventId = resolveSupabaseEventId(routeEventId);

  if (routeEventId !== LOCAL_DEMO_EVENT_ALIAS && !isUuid(routeEventId)) {
    return {
      status: 'not_found',
      message: `Evento "${routeEventId}" non trovato. Gli slug saranno abilitati con la migration edizioni.`,
    };
  }

  const supabase = createSupabaseServiceClient();
  const { data: eventRow, error: eventError } = await supabase
    .from('events')
    .select('id,name,location,starts_at,ends_at,status')
    .eq('id', resolvedEventId)
    .maybeSingle();

  if (eventError) {
    throw new Error(eventError.message);
  }

  if (!eventRow) {
    return {
      status: 'not_found',
      message: `Evento "${routeEventId}" non trovato.`,
    };
  }

  const event = eventRow as EventRow;
  const [categoriesCount, stationsCount, participantsCount, heatsCount, judgesCount, scoresCount] = await Promise.all([
    countRows('categories', resolvedEventId),
    countRows('stations', resolvedEventId),
    countRows('participants', resolvedEventId),
    countRows('heats', resolvedEventId),
    countRows('judges', resolvedEventId),
    countRows('scores', resolvedEventId),
  ]);

  return {
    status: 'ready',
    event: {
      id: event.id,
      routeId: routeEventId,
      name: event.name,
      location: event.location,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      status: event.status,
      source: 'supabase',
      counts: {
        categories: categoriesCount,
        heats: heatsCount,
        judges: judgesCount,
        participants: participantsCount,
        scores: scoresCount,
        stations: stationsCount,
      },
    },
  };
}

async function countRows(table: string, eventId: string): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq('event_id', eventId);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}
