-- HITRACE60 runtime RBAC/RLS validation setup
--
-- Purpose:
-- - Create missing profiles for existing Supabase Auth users.
-- - Assign admin/viewer test roles for one event.
-- - Validate the owner email matches the real events.owner_id.
-- - Do NOT create auth.users.
-- - Do NOT modify events.owner_id.
--
-- Before running, edit the constants in the cfg CTE.

do $$
declare
  target_event_slug text := 'hitrace60-settembre-2026';
  owner_email text := 'owner@example.com';
  admin_email text := 'admin@example.com';
  viewer_email text := 'viewer@example.com';
  external_email text := 'external@example.com';

  target_event_id uuid;
  actual_owner_id uuid;
  owner_user_id uuid;
  admin_user_id uuid;
  viewer_user_id uuid;
  external_user_id uuid;
begin
  select e.id, e.owner_id
  into target_event_id, actual_owner_id
  from public.events e
  where e.slug = target_event_slug or e.id::text = target_event_slug
  limit 1;

  if target_event_id is null then
    raise exception 'Event not found for slug/id: %', target_event_slug;
  end if;

  select u.id into owner_user_id from auth.users u where lower(u.email) = lower(owner_email) limit 1;
  select u.id into admin_user_id from auth.users u where lower(u.email) = lower(admin_email) limit 1;
  select u.id into viewer_user_id from auth.users u where lower(u.email) = lower(viewer_email) limit 1;
  select u.id into external_user_id from auth.users u where lower(u.email) = lower(external_email) limit 1;

  if owner_user_id is null then
    raise exception 'Owner auth user not found: %', owner_email;
  end if;

  if owner_user_id <> actual_owner_id then
    raise exception 'Owner email % does not match events.owner_id for event %', owner_email, target_event_slug;
  end if;

  if admin_user_id is null then
    raise exception 'Admin auth user not found: %', admin_email;
  end if;

  if viewer_user_id is null then
    raise exception 'Viewer auth user not found: %', viewer_email;
  end if;

  if external_user_id is null then
    raise exception 'External auth user not found: %', external_email;
  end if;

  insert into public.profiles (id, full_name)
  values
    (owner_user_id, coalesce(split_part(owner_email, '@', 1), 'HITRACE60 Owner')),
    (admin_user_id, coalesce(split_part(admin_email, '@', 1), 'HITRACE60 Admin')),
    (viewer_user_id, coalesce(split_part(viewer_email, '@', 1), 'HITRACE60 Viewer')),
    (external_user_id, coalesce(split_part(external_email, '@', 1), 'HITRACE60 External'))
  on conflict (id) do nothing;

  insert into public.event_admins (event_id, user_id, role)
  values
    (target_event_id, owner_user_id, 'owner'),
    (target_event_id, admin_user_id, 'admin'),
    (target_event_id, viewer_user_id, 'viewer')
  on conflict (event_id, user_id)
  do update set role = excluded.role;

  raise notice 'Runtime test users configured for event % (%)', target_event_slug, target_event_id;
  raise notice 'Owner: % / Admin: % / Viewer: % / External profile only: %', owner_email, admin_email, viewer_email, external_email;
end $$;
