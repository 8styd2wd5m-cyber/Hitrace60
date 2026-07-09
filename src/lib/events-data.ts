import { demoCategories, demoHeats, demoParticipants, demoStations } from './demo-data.ts';
import {
  LOCAL_DEMO_EVENT_ALIAS,
  getAdminEventRedirectForMistakenJudgeToken,
  resolveEventIdOrSlug,
  resolveSupabaseEventId,
} from './event-id.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from './supabase/server.ts';
import type { EventStatus } from './types.ts';

export interface AdminEventOverview {
  id: string;
  routeId: string;
  name: string;
  location: string | null;
  editionLabel?: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: EventStatus;
  timezone?: string | null;
  updatedAt?: string | null;
  source: 'supabase' | 'demo';
  counts: {
    categories: number;
    heats: number;
    judgeAssignments: number;
    judges: number;
    participants: number;
    scores: number;
    stations: number;
    validatedScores: number;
  };
  operations: {
    completedStations: number | null;
    latestScoreAt: string | null;
  };
}

export interface AdminEventListItem {
  id: string;
  routeId: string;
  name: string;
  location: string | null;
  editionLabel?: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: EventStatus;
  timezone?: string | null;
  updatedAt?: string | null;
  source: 'supabase' | 'demo';
  counts: {
    heats: number;
    participants: number;
    scores: number;
  };
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
  slug?: string | null;
  edition_label?: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: EventStatus;
  timezone?: string | null;
  updated_at?: string | null;
}

export async function listAdminEvents(): Promise<AdminEventListItem[]> {
  if (!hasSupabaseServerConfig()) {
    return [
      {
        id: LOCAL_DEMO_EVENT_ALIAS,
        routeId: LOCAL_DEMO_EVENT_ALIAS,
        name: 'HITRACE60 Demo Event',
        editionLabel: 'Giugno 2026 Demo',
        location: 'Demo Arena',
        startsAt: '2026-07-07T08:00:00+02:00',
        endsAt: '2026-07-07T18:00:00+02:00',
        status: 'live',
        timezone: 'Europe/Rome',
        updatedAt: null,
        source: 'demo',
        counts: {
          heats: demoHeats.length,
          participants: demoParticipants.length,
          scores: 0,
        },
      },
    ];
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('events')
    .select('id,name,slug,edition_label,location,starts_at,ends_at,status,timezone,updated_at')
    .order('starts_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return Promise.all(
    ((data ?? []) as EventRow[]).map(async (event) => {
      const [participantsCount, heatsCount, scoresCount] = await Promise.all([
        countRows('participants', event.id),
        countRows('heats', event.id),
        countRows('scores', event.id),
      ]);

      return {
        id: event.id,
        routeId: event.slug ?? (event.id === resolveSupabaseEventId(LOCAL_DEMO_EVENT_ALIAS) ? LOCAL_DEMO_EVENT_ALIAS : event.id),
        name: event.name,
        editionLabel: event.edition_label,
        location: event.location,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
        status: event.status,
        timezone: event.timezone,
        updatedAt: event.updated_at,
        source: 'supabase' as const,
        counts: {
          heats: heatsCount,
          participants: participantsCount,
          scores: scoresCount,
        },
      };
    }),
  );
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
        editionLabel: 'Giugno 2026 Demo',
        location: 'Demo Arena',
        startsAt: '2026-07-07T08:00:00+02:00',
        endsAt: '2026-07-07T18:00:00+02:00',
        status: 'live',
        timezone: 'Europe/Rome',
        source: 'demo',
        counts: {
          categories: demoCategories.length,
          heats: demoHeats.length,
          judgeAssignments: demoStations.filter((station) => station.isScored).length,
          judges: demoStations.filter((station) => station.isScored).length,
          participants: demoParticipants.length,
          scores: 0,
          stations: demoStations.filter((station) => station.isScored).length,
          validatedScores: 0,
        },
        operations: {
          completedStations: null,
          latestScoreAt: null,
        },
      },
    };
  }

  const resolvedEventId = await resolveEventIdOrSlug(routeEventId);

  if (!resolvedEventId) {
    return {
      status: 'not_found',
      message: `Evento "${routeEventId}" non trovato.`,
    };
  }

  const supabase = createSupabaseServiceClient();
  const { data: eventRow, error: eventError } = await supabase
    .from('events')
    .select('id,name,slug,edition_label,location,starts_at,ends_at,status,timezone,updated_at')
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
  const [
    categoriesCount,
    stationsCount,
    participantsCount,
    heatsCount,
    judgesCount,
    judgeAssignmentsCount,
    scoresCount,
    validatedScoresCount,
    completedStationsCount,
    latestScoreAt,
  ] = await Promise.all([
    countRows('categories', resolvedEventId),
    countRows('stations', resolvedEventId),
    countRows('participants', resolvedEventId),
    countRows('heats', resolvedEventId),
    countRows('judges', resolvedEventId),
    countRows('judge_station_assignments', resolvedEventId),
    countRows('scores', resolvedEventId),
    countRowsByStatuses('scores', resolvedEventId, ['validated', 'corrected']),
    countCompletedStations(resolvedEventId),
    loadLatestScoreAt(resolvedEventId),
  ]);

  return {
    status: 'ready',
    event: {
      id: event.id,
      routeId: event.slug ?? routeEventId,
      name: event.name,
      editionLabel: event.edition_label,
      location: event.location,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      status: event.status,
      timezone: event.timezone,
      updatedAt: event.updated_at,
      source: 'supabase',
      counts: {
        categories: categoriesCount,
        heats: heatsCount,
        judgeAssignments: judgeAssignmentsCount,
        judges: judgesCount,
        participants: participantsCount,
        scores: scoresCount,
        stations: stationsCount,
        validatedScores: validatedScoresCount,
      },
      operations: {
        completedStations: completedStationsCount,
        latestScoreAt,
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

async function countRowsByStatuses(table: string, eventId: string, statuses: string[]): Promise<number> {
  const supabase = createSupabaseServiceClient();
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .in('status', statuses);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function countCompletedStations(eventId: string): Promise<number | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('scores')
    .select('station_id')
    .eq('event_id', eventId)
    .in('status', ['validated', 'corrected']);

  if (error) {
    throw new Error(error.message);
  }

  return new Set((data ?? []).map((row) => row.station_id as string)).size;
}

async function loadLatestScoreAt(eventId: string): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('scores')
    .select('updated_at')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.updated_at as string | undefined) ?? null;
}
