-- HITRACE60 MVP seed.
-- Token giudici demo reali:
-- judge-echo-bike-demo-token
-- judge-farmer-carry-demo-token
-- judge-rower-demo-token
-- judge-burpees-demo-token
-- judge-bike-erg-demo-token
-- judge-bear-hug-carry-demo-token
-- judge-ski-erg-demo-token
-- judge-yoke-carry-demo-token

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'admin@hitrace60.local',
  crypt('hitrace60-demo-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"HITRACE60 Admin"}'::jsonb,
  now(),
  now()
) on conflict (id) do nothing;

insert into profiles (id, full_name)
values ('00000000-0000-0000-0000-000000000001', 'HITRACE60 Admin')
on conflict (id) do update set full_name = excluded.full_name;

insert into events (id, name, location, starts_at, ends_at, status, owner_id, public_leaderboard_enabled)
values (
  '10000000-0000-0000-0000-000000000001',
  'HITRACE60 Demo Event',
  'Demo Arena',
  '2026-07-07T08:00:00+02:00',
  '2026-07-07T18:00:00+02:00',
  'live',
  '00000000-0000-0000-0000-000000000001',
  true
) on conflict (id) do update
set name = excluded.name,
    status = excluded.status,
    public_leaderboard_enabled = excluded.public_leaderboard_enabled;

insert into event_settings (event_id, default_lane_count, default_heat_duration_minutes, default_transition_minutes, timezone)
values ('10000000-0000-0000-0000-000000000001', 4, 60, 10, 'Europe/Rome')
on conflict (event_id) do update
set default_lane_count = excluded.default_lane_count,
    default_heat_duration_minutes = excluded.default_heat_duration_minutes,
    default_transition_minutes = excluded.default_transition_minutes,
    timezone = excluded.timezone;

insert into categories (id, event_id, code, name, type, team_size, race_day, start_order)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'M', 'Individual M', 'individual', 1, '2026-07-07', 1),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'F', 'Individual F', 'individual', 1, '2026-07-07', 2),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'MM', 'Team MM', 'team_2', 2, '2026-07-07', 3),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'MF', 'Team MF', 'team_2', 2, '2026-07-07', 4),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'FF', 'Team FF', 'team_2', 2, '2026-07-07', 5),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'MMM', 'Team MMM', 'team_3', 3, '2026-07-07', 6),
  ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'MMF', 'Team MMF', 'team_3', 3, '2026-07-07', 7)
on conflict (id) do update
set name = excluded.name,
    type = excluded.type,
    team_size = excluded.team_size,
    start_order = excluded.start_order;

insert into stations (id, event_id, name, slug, station_order, score_type, score_unit, is_scored, higher_is_better, active)
values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Echo Bike', 'echo-bike', 1, 'numeric', 'cal', true, true, true),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Farmer Carry', 'farmer-carry', 2, 'numeric', 'reps', true, true, true),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Rower', 'rower', 3, 'numeric', 'cal', true, true, true),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Burpees over obstacle', 'burpees-over-obstacle', 4, 'numeric', 'reps', true, true, true),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Bike Erg', 'bike-erg', 5, 'numeric', 'cal', true, true, true),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Bear Hug Carry', 'bear-hug-carry', 6, 'numeric', 'reps', true, true, true),
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'Ski Erg', 'ski-erg', 7, 'numeric', 'cal', true, true, true),
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'Yoke Carry', 'yoke-carry', 8, 'numeric', 'reps', true, true, true)
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    station_order = excluded.station_order,
    score_unit = excluded.score_unit,
    active = excluded.active;

insert into participants (id, event_id, category_id, display_name, bib_number, status, seed_order)
values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'Team Alpha', '101', 'registered', 1),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'Team Bravo', '102', 'registered', 2),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'Team Charlie', '103', 'registered', 3),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'Team Delta', '104', 'registered', 4)
on conflict (id) do update
set display_name = excluded.display_name,
    bib_number = excluded.bib_number,
    status = excluded.status,
    seed_order = excluded.seed_order;

insert into heats (id, event_id, category_id, heat_number, starts_at, ends_at, lane_count, status)
values (
  '50000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000003',
  1,
  '2026-07-07T10:00:00+02:00',
  '2026-07-07T11:02:20+02:00',
  4,
  'current'
) on conflict (id) do update
set starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    lane_count = excluded.lane_count,
    status = excluded.status;

insert into heat_participants (id, heat_id, participant_id, lane_number, lane_label)
values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 'Lane 1'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 2, 'Lane 2'),
  ('60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 3, 'Lane 3'),
  ('60000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', 4, 'Lane 4')
on conflict (id) do update
set lane_number = excluded.lane_number,
    lane_label = excluded.lane_label;

insert into judges (id, event_id, name, email, active)
values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Giudice Echo Bike', 'judge.echo@hitrace60.local', true),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Giudice Farmer Carry', 'judge.farmer@hitrace60.local', true),
  ('70000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Giudice Rower', 'judge.rower@hitrace60.local', true),
  ('70000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Giudice Burpees', 'judge.burpees@hitrace60.local', true),
  ('70000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'Giudice Bike Erg', 'judge.bikeerg@hitrace60.local', true),
  ('70000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'Giudice Bear Hug Carry', 'judge.bearhug@hitrace60.local', true),
  ('70000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'Giudice Ski Erg', 'judge.skierg@hitrace60.local', true),
  ('70000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'Giudice Yoke Carry', 'judge.yoke@hitrace60.local', true)
on conflict (id) do update
set name = excluded.name,
    email = excluded.email,
    active = excluded.active;

insert into judge_station_assignments (
  id,
  event_id,
  judge_id,
  station_id,
  token_hash,
  qr_url,
  active,
  expires_at
) values (
  '80000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  encode(digest('judge-echo-bike-demo-token', 'sha256'), 'hex'),
  '/judge/judge-echo-bike-demo-token',
  true,
  '2026-12-31T23:59:59+01:00'
), (
  '80000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  encode(digest('judge-farmer-carry-demo-token', 'sha256'), 'hex'),
  '/judge/judge-farmer-carry-demo-token',
  true,
  '2026-12-31T23:59:59+01:00'
), (
  '80000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000003',
  encode(digest('judge-rower-demo-token', 'sha256'), 'hex'),
  '/judge/judge-rower-demo-token',
  true,
  '2026-12-31T23:59:59+01:00'
), (
  '80000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000004',
  '30000000-0000-0000-0000-000000000004',
  encode(digest('judge-burpees-demo-token', 'sha256'), 'hex'),
  '/judge/judge-burpees-demo-token',
  true,
  '2026-12-31T23:59:59+01:00'
), (
  '80000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000005',
  '30000000-0000-0000-0000-000000000005',
  encode(digest('judge-bike-erg-demo-token', 'sha256'), 'hex'),
  '/judge/judge-bike-erg-demo-token',
  true,
  '2026-12-31T23:59:59+01:00'
), (
  '80000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000006',
  '30000000-0000-0000-0000-000000000006',
  encode(digest('judge-bear-hug-carry-demo-token', 'sha256'), 'hex'),
  '/judge/judge-bear-hug-carry-demo-token',
  true,
  '2026-12-31T23:59:59+01:00'
), (
  '80000000-0000-0000-0000-000000000007',
  '10000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000007',
  '30000000-0000-0000-0000-000000000007',
  encode(digest('judge-ski-erg-demo-token', 'sha256'), 'hex'),
  '/judge/judge-ski-erg-demo-token',
  true,
  '2026-12-31T23:59:59+01:00'
), (
  '80000000-0000-0000-0000-000000000008',
  '10000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000008',
  '30000000-0000-0000-0000-000000000008',
  encode(digest('judge-yoke-carry-demo-token', 'sha256'), 'hex'),
  '/judge/judge-yoke-carry-demo-token',
  true,
  '2026-12-31T23:59:59+01:00'
) on conflict (id) do update
set token_hash = excluded.token_hash,
    qr_url = excluded.qr_url,
    active = excluded.active,
    expires_at = excluded.expires_at;

insert into scorecards (
  event_id,
  judge_assignment_id,
  station_id,
  heat_id,
  participant_id,
  status
)
select
  h.event_id,
  jsa.id,
  s.id,
  hp.heat_id,
  hp.participant_id,
  'generated'
from heat_participants hp
join heats h on h.id = hp.heat_id
join stations s on s.event_id = h.event_id and s.is_scored = true and s.active = true
left join judge_station_assignments jsa
  on jsa.event_id = h.event_id
  and jsa.station_id = s.id
  and jsa.active = true
where h.event_id = '10000000-0000-0000-0000-000000000001'
on conflict (event_id, station_id, heat_id, participant_id) do update
set judge_assignment_id = excluded.judge_assignment_id,
    status = excluded.status;
