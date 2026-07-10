import { LOCAL_DEMO_EVENT_ALIAS, SEEDED_SUPABASE_DEMO_EVENT_ID, isUuid } from '@/lib/event-id.ts';
import { createSupabaseUserServerClient } from '@/lib/supabase/auth-server.ts';
import {
  createSupabaseServiceClient,
  hasSupabaseAuthConfig,
  hasSupabaseServiceConfig,
} from '@/lib/supabase/server.ts';
import type { EventStatus } from '@/lib/types.ts';
import { AdminActionError } from './action-errors.ts';

export type AuthenticatedAdminUser = {
  id: string;
  email: string | null;
  fullName?: string | null;
};

export type EventAdminRole = 'owner' | 'admin';

export type EventAdminContext = {
  user: AuthenticatedAdminUser;
  event: {
    id: string;
    ownerId: string;
    slug: string | null;
    status: EventStatus;
  };
  role: EventAdminRole;
};

export type AdminEventOperation =
  | 'delete_event'
  | 'duplicate_event'
  | 'manage_judges'
  | 'manage_participants'
  | 'manage_timeline'
  | 'update_event_status';

type EventAuthorizationRow = {
  id: string;
  owner_id: string;
  slug: string | null;
  status: EventStatus;
};

type EventAdminRow = {
  role: string | null;
};

const allowedStatusTransitions: Record<EventStatus, EventStatus[]> = {
  archived: [],
  completed: ['archived'],
  draft: ['published'],
  live: ['completed'],
  published: ['draft', 'live'],
};

export async function requireAuthenticatedUser(): Promise<AuthenticatedAdminUser> {
  if (!hasSupabaseAuthConfig()) {
    throw new AdminActionError('auth_config_missing');
  }

  const supabase = await createSupabaseUserServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AdminActionError('not_authenticated');
  }

  const userMetadata = user.user_metadata as Record<string, unknown> | undefined;
  const metadataFullName = getNonEmptyString(userMetadata?.full_name) ?? getNonEmptyString(userMetadata?.name);

  return {
    id: user.id,
    email: user.email ?? null,
    ...(metadataFullName ? { fullName: metadataFullName } : {}),
  };
}

export async function requireEventAdmin(eventId: string, authenticatedUser?: AuthenticatedAdminUser): Promise<EventAdminContext> {
  const user = authenticatedUser ?? (await requireAuthenticatedUser());

  if (!isUuid(eventId)) {
    throw new AdminActionError('invalid_input');
  }

  if (!hasSupabaseServiceConfig()) {
    throw new AdminActionError('service_config_missing');
  }

  const supabase = createSupabaseServiceClient();
  const { data: eventRow, error: eventError } = await supabase
    .from('events')
    .select('id,owner_id,slug,status')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError || !eventRow) {
    throw new AdminActionError('event_not_found');
  }

  const event = eventRow as EventAuthorizationRow;

  if (event.owner_id === user.id) {
    return {
      user,
      event: {
        id: event.id,
        ownerId: event.owner_id,
        slug: event.slug,
        status: event.status,
      },
      role: 'owner',
    };
  }

  const { data: adminRow, error: adminError } = await supabase
    .from('event_admins')
    .select('role')
    .eq('event_id', event.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError || !adminRow) {
    throw new AdminActionError('not_authorized');
  }

  const role = (adminRow as EventAdminRow).role;

  if (role !== 'owner' && role !== 'admin') {
    throw new AdminActionError('not_authorized');
  }

  return {
    user,
    event: {
      id: event.id,
      ownerId: event.owner_id,
      slug: event.slug,
      status: event.status,
    },
    role,
  };
}

export async function requireEventAdminByRouteId(routeEventId: string): Promise<EventAdminContext> {
  const user = await requireAuthenticatedUser();
  const eventId = await resolveAuthorizedEventId(routeEventId);

  if (!eventId) {
    throw new AdminActionError('event_not_found');
  }

  return await requireEventAdmin(eventId, user);
}

export function requireEventOperation(
  context: EventAdminContext,
  operation: AdminEventOperation,
  targetStatus?: EventStatus,
): void {
  if (operation === 'duplicate_event') {
    return;
  }

  if (operation === 'delete_event' || operation === 'manage_judges' || operation === 'manage_participants' || operation === 'manage_timeline') {
    if (context.event.status === 'draft' || context.event.status === 'published') {
      return;
    }

    throw new AdminActionError('event_state_not_allowed');
  }

  if (!targetStatus) {
    throw new AdminActionError('invalid_input');
  }

  if (context.event.status === targetStatus) {
    return;
  }

  if (allowedStatusTransitions[context.event.status].includes(targetStatus)) {
    return;
  }

  throw new AdminActionError('event_state_not_allowed');
}

export async function ensureProfileForUser(user: AuthenticatedAdminUser): Promise<void> {
  if (!hasSupabaseServiceConfig()) {
    throw new AdminActionError('service_config_missing');
  }

  const supabase = createSupabaseServiceClient();
  const { data: existingProfile, error: profileError } = await supabase.from('profiles').select('id,full_name').eq('id', user.id).maybeSingle();

  if (profileError) {
    throw new AdminActionError('not_authorized');
  }

  if (existingProfile) {
    if (getNonEmptyString((existingProfile as { full_name?: string | null }).full_name)) {
      return;
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: getProfileFullName(user),
      })
      .eq('id', user.id);

    if (updateError) {
      throw new AdminActionError('not_authorized');
    }

    return;
  }

  const { error: insertError } = await supabase.from('profiles').insert({
    id: user.id,
    full_name: getProfileFullName(user),
  });

  if (insertError) {
    throw new AdminActionError('not_authorized');
  }
}

function getProfileFullName(user: AuthenticatedAdminUser): string {
  const metadataName = getNonEmptyString(user.fullName);

  if (metadataName) return metadataName;

  const emailLocalPart = getNonEmptyString(user.email?.split('@')[0]);

  if (emailLocalPart) return emailLocalPart;

  return 'Admin HITRACE60';
}

function getNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function ensureEventOwnerAdmin(eventId: string, user: AuthenticatedAdminUser): Promise<void> {
  if (!hasSupabaseServiceConfig()) {
    throw new AdminActionError('service_config_missing');
  }

  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.from('event_admins').upsert(
    {
      event_id: eventId,
      role: 'owner',
      user_id: user.id,
    },
    {
      onConflict: 'event_id,user_id',
    },
  );

  if (error) {
    throw new AdminActionError('not_authorized');
  }
}

async function resolveAuthorizedEventId(routeEventId: string): Promise<string | null> {
  const normalizedRouteEventId = routeEventId.trim();

  if (!normalizedRouteEventId) {
    throw new AdminActionError('invalid_input');
  }

  if (normalizedRouteEventId === LOCAL_DEMO_EVENT_ALIAS) {
    return SEEDED_SUPABASE_DEMO_EVENT_ID;
  }

  if (isUuid(normalizedRouteEventId)) {
    return normalizedRouteEventId;
  }

  if (!hasSupabaseServiceConfig()) {
    throw new AdminActionError('service_config_missing');
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.from('events').select('id').eq('slug', normalizedRouteEventId).maybeSingle();

  if (error) {
    throw new AdminActionError('event_not_found');
  }

  return data?.id ?? null;
}
