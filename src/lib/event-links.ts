import QRCode from 'qrcode';
import { HITRACE_JUDGE_TOKENS_BY_STATION_SLUG, getRaceStationOrderBySlug } from './constants.ts';
import { demoStations } from './demo-data.ts';
import {
  LOCAL_DEMO_EVENT_ALIAS,
  getAdminEventRedirectForMistakenJudgeToken,
  resolveEventIdOrSlug,
} from './event-id.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from './supabase/server.ts';

export interface EventUtilityLink {
  label: string;
  url: string;
  qrDataUrl: string;
}

export interface JudgeUtilityLink {
  stationId: string;
  stationName: string;
  stationSlug: string;
  raceStationOrder: number;
  token: string;
  url: string;
  ready: boolean;
  missingReason?: string;
  qrDataUrl: string | null;
}

export interface EventLinksData {
  adminLinks: EventUtilityLink[];
  displayLink: EventUtilityLink;
  judgeLinks: JudgeUtilityLink[];
  routeEventId: string;
  source: 'supabase' | 'demo';
}

interface StationRow {
  id: string;
  name: string;
  slug: string;
  station_order: number;
  is_scored: boolean;
  active: boolean;
}

interface AssignmentRow {
  id: string;
  station_id: string;
  qr_url: string | null;
  active: boolean;
}

const DEFAULT_LOCAL_BASE_URL = 'http://192.168.31.245:3000';

export async function loadEventLinksData(routeEventId: string): Promise<EventLinksData | { redirectEventId: string }> {
  const redirectEventId = getAdminEventRedirectForMistakenJudgeToken(routeEventId);

  if (redirectEventId) {
    return { redirectEventId };
  }

  const baseUrl = getConfiguredBaseUrl();
  const adminLinks = await buildAdminLinks(baseUrl, routeEventId);
  const displayUrl = `${baseUrl}/display/${routeEventId}`;
  const displayLink = {
    label: 'Display live',
    url: displayUrl,
    qrDataUrl: await QRCode.toDataURL(displayUrl, { margin: 1, width: 220 }),
  };

  if (!hasSupabaseServerConfig()) {
    const judgeLinks = await Promise.all(
      demoStations
        .filter((station) => station.eventId === LOCAL_DEMO_EVENT_ALIAS && station.isScored)
        .map(async (station) => buildDemoJudgeLink(baseUrl, station)),
    );

    return {
      adminLinks,
      displayLink,
      judgeLinks,
      routeEventId,
      source: 'demo',
    };
  }

  const resolvedEventId = await resolveEventIdOrSlug(routeEventId);

  if (!resolvedEventId) {
    throw new Error(`Evento "${routeEventId}" non trovato`);
  }

  const supabase = createSupabaseServiceClient();
  const [stationsResult, assignmentsResult] = await Promise.all([
    supabase
      .from('stations')
      .select('id,name,slug,station_order,is_scored,active')
      .eq('event_id', resolvedEventId)
      .eq('is_scored', true)
      .order('station_order', { ascending: true }),
    supabase.from('judge_station_assignments').select('id,station_id,qr_url,active').eq('event_id', resolvedEventId),
  ]);

  const firstError = stationsResult.error ?? assignmentsResult.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const assignmentsByStationId = new Map(
    ((assignmentsResult.data ?? []) as AssignmentRow[])
      .filter((assignment) => assignment.active)
      .map((assignment) => [assignment.station_id, assignment]),
  );
  const judgeLinks = await Promise.all(
    ((stationsResult.data ?? []) as StationRow[]).map(async (station) =>
      buildSupabaseJudgeLink(baseUrl, station, assignmentsByStationId.get(station.id)),
    ),
  );

  return {
    adminLinks,
    displayLink,
    judgeLinks,
    routeEventId,
    source: 'supabase',
  };
}

function getConfiguredBaseUrl(): string {
  return process.env.NEXT_PUBLIC_JUDGE_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_LOCAL_BASE_URL;
}

async function buildAdminLinks(baseUrl: string, routeEventId: string): Promise<EventUtilityLink[]> {
  const links = [
    ['Dashboard admin', `/admin/events/${routeEventId}`],
    ['Partecipanti', `/admin/events/${routeEventId}/participants`],
    ['Timeline', `/admin/events/${routeEventId}/timeline`],
    ['Giudici', `/admin/events/${routeEventId}/judges`],
    ['Live links', `/admin/events/${routeEventId}/links`],
  ] as const;

  return Promise.all(
    links.map(async ([label, path]) => {
      const url = `${baseUrl}${path}`;
      return {
        label,
        url,
        qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 180 }),
      };
    }),
  );
}

async function buildDemoJudgeLink(baseUrl: string, station: (typeof demoStations)[number]): Promise<JudgeUtilityLink> {
  const token = HITRACE_JUDGE_TOKENS_BY_STATION_SLUG[station.slug] ?? '';
  const url = token ? `${baseUrl}/judge/${token}` : '';

  return {
    stationId: station.id,
    stationName: station.name,
    stationSlug: station.slug,
    raceStationOrder: station.raceStationOrder ?? station.stationOrder * 2 - 1,
    token,
    url,
    ready: Boolean(token),
    missingReason: token ? undefined : 'Token demo mancante',
    qrDataUrl: token ? await QRCode.toDataURL(url, { margin: 1, width: 180 }) : null,
  };
}

async function buildSupabaseJudgeLink(
  baseUrl: string,
  station: StationRow,
  assignment: AssignmentRow | undefined,
): Promise<JudgeUtilityLink> {
  const token = extractJudgeTokenFromQrUrl(assignment?.qr_url) ?? HITRACE_JUDGE_TOKENS_BY_STATION_SLUG[station.slug] ?? '';
  const url = token ? `${baseUrl}/judge/${token}` : '';
  const ready = Boolean(station.active && assignment && token);

  return {
    stationId: station.id,
    stationName: station.name,
    stationSlug: station.slug,
    raceStationOrder: getRaceStationOrderBySlug(station.slug, station.station_order),
    token,
    url,
    ready,
    missingReason: ready
      ? undefined
      : !station.active
        ? 'Stazione non attiva'
        : !assignment
          ? 'Assignment giudice mancante'
          : 'Token non configurato',
    qrDataUrl: token ? await QRCode.toDataURL(url, { margin: 1, width: 180 }) : null,
  };
}

function extractJudgeTokenFromQrUrl(qrUrl: string | null | undefined): string | null {
  if (!qrUrl) {
    return null;
  }

  const match = qrUrl.match(/\/judge\/([^/?#]+)/);

  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
