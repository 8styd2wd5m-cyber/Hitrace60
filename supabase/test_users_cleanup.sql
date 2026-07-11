-- HITRACE60 runtime RBAC/RLS validation cleanup
--
-- Purpose:
-- - Remove test event_admins assignments for admin/viewer.
-- - Leave events untouched.
-- - Leave auth.users untouched.
-- - Leave profiles untouched.
-- - Leave the real owner assignment untouched.
--
-- Before running, edit the constants below to match test_users_setup.sql.

do $$
declare
  target_event_slug text := 'hitrace60-settembre-2026';
  admin_email text := 'admin@example.com';
  viewer_email text := 'viewer@example.com';

  target_event_id uuid;
  admin_user_id uuid;
  viewer_user_id uuid;
begin
  select e.id
  into target_event_id
  from public.events e
  where e.slug = target_event_slug or e.id::text = target_event_slug
  limit 1;

  if target_event_id is null then
    raise exception 'Event not found for slug/id: %', target_event_slug;
  end if;

  select u.id into admin_user_id from auth.users u where lower(u.email) = lower(admin_email) limit 1;
  select u.id into viewer_user_id from auth.users u where lower(u.email) = lower(viewer_email) limit 1;

  delete from public.event_admins ea
  where ea.event_id = target_event_id
    and ea.user_id in (
      select id from auth.users where lower(email) in (lower(admin_email), lower(viewer_email))
    );

  raise notice 'Removed test admin/viewer event_admins for event % (%)', target_event_slug, target_event_id;
  raise notice 'Profiles and auth.users were left untouched. Admin user: %, Viewer user: %', admin_user_id, viewer_user_id;
end $$;
