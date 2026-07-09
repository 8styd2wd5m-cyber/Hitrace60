create extension if not exists "pgcrypto";

create type event_status as enum ('draft', 'published', 'live', 'completed', 'archived');
create type category_type as enum ('individual', 'team_2', 'team_3');
create type participant_status as enum ('registered', 'checked_in', 'withdrawn', 'dnf');
create type heat_status as enum ('scheduled', 'current', 'completed', 'locked');
create type score_status as enum ('draft', 'submitted', 'validated', 'corrected', 'locked');
create type timeline_block_type as enum ('heat', 'break', 'custom', 'briefing', 'ceremony');
create type scorecard_status as enum ('generated', 'printed', 'used', 'void');
create type audit_entity_type as enum ('score', 'participant', 'heat', 'event', 'judge');
create type audit_action as enum ('created', 'updated', 'deleted', 'submitted', 'validated', 'corrected', 'locked');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  status event_status not null default 'draft',
  owner_id uuid not null references profiles(id),
  public_leaderboard_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table event_admins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table event_settings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references events(id) on delete cascade,
  default_lane_count int not null default 6 check (default_lane_count > 0),
  default_heat_duration_minutes int not null default 60 check (default_heat_duration_minutes > 0),
  default_transition_minutes int not null default 10 check (default_transition_minutes >= 0),
  timezone text not null default 'Europe/Rome',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  code text not null check (code in ('M', 'F', 'MM', 'MF', 'FF', 'MMM', 'MMF')),
  name text not null,
  type category_type not null,
  team_size int not null check (team_size in (1, 2, 3)),
  race_day date,
  start_order int not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, code)
);

create table stations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  slug text not null,
  station_order int not null check (station_order > 0),
  score_type text not null default 'numeric',
  score_unit text not null default 'reps',
  is_scored boolean not null default true,
  higher_is_better boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (event_id, slug),
  unique (event_id, station_order)
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  display_name text not null,
  bib_number text,
  status participant_status not null default 'registered',
  seed_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, bib_number)
);

create table participant_members (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references participants(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  gender text check (gender in ('M', 'F')),
  email text,
  phone text,
  member_order int not null check (member_order > 0),
  unique (participant_id, member_order)
);

create table heats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  heat_number int not null check (heat_number > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  lane_count int not null check (lane_count > 0),
  status heat_status not null default 'scheduled',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, category_id, heat_number),
  check (ends_at > starts_at)
);

create table heat_participants (
  id uuid primary key default gen_random_uuid(),
  heat_id uuid not null references heats(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  lane_number int not null check (lane_number > 0),
  lane_label text,
  created_at timestamptz not null default now(),
  unique (heat_id, participant_id),
  unique (heat_id, lane_number)
);

create table judges (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table judge_station_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  judge_id uuid not null references judges(id) on delete cascade,
  station_id uuid not null references stations(id) on delete cascade,
  token_hash text not null unique,
  qr_url text,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, judge_id, station_id)
);

create table timeline_blocks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  heat_id uuid references heats(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  block_type timeline_block_type not null,
  title text not null,
  race_day date,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  sort_order int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table scorecards (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  judge_assignment_id uuid references judge_station_assignments(id) on delete set null,
  station_id uuid not null references stations(id) on delete cascade,
  heat_id uuid references heats(id) on delete cascade,
  participant_id uuid references participants(id) on delete cascade,
  pdf_url text,
  status scorecard_status not null default 'generated',
  generated_at timestamptz not null default now(),
  printed_at timestamptz
);

create table scores (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  category_id uuid not null references categories(id) on delete restrict,
  participant_id uuid not null references participants(id) on delete cascade,
  station_id uuid not null references stations(id) on delete restrict,
  heat_id uuid not null references heats(id) on delete restrict,
  judge_id uuid references judges(id) on delete set null,
  judge_assignment_id uuid references judge_station_assignments(id) on delete set null,
  lane_number int check (lane_number > 0),
  raw_score numeric(10, 2) not null check (raw_score >= 0),
  status score_status not null default 'draft',
  notes text,
  correction_reason text,
  submitted_at timestamptz,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, participant_id, station_id, heat_id)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  entity_type audit_entity_type not null,
  entity_id uuid not null,
  action audit_action not null,
  actor_user_id uuid references profiles(id) on delete set null,
  actor_judge_id uuid references judges(id) on delete set null,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index categories_event_sort_idx on categories(event_id, start_order);
create index stations_event_order_idx on stations(event_id, station_order);
create index participants_event_category_idx on participants(event_id, category_id);
create index heats_event_category_number_idx on heats(event_id, category_id, heat_number);
create index heat_participants_heat_lane_idx on heat_participants(heat_id, lane_number);
create index scores_leaderboard_idx on scores(event_id, category_id, station_id, raw_score desc);
create index scores_participant_idx on scores(event_id, participant_id);
create index scores_status_idx on scores(status);
create index judge_assignments_event_station_idx on judge_station_assignments(event_id, station_id);
create index timeline_event_start_idx on timeline_blocks(event_id, starts_at);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_updated_at before update on events for each row execute function set_updated_at();
create trigger event_settings_updated_at before update on event_settings for each row execute function set_updated_at();
create trigger participants_updated_at before update on participants for each row execute function set_updated_at();
create trigger heats_updated_at before update on heats for each row execute function set_updated_at();
create trigger scores_updated_at before update on scores for each row execute function set_updated_at();

create or replace function validate_score_consistency()
returns trigger language plpgsql as $$
declare
  participant_record record;
  heat_record record;
  assignment_record record;
begin
  select event_id, category_id into participant_record from participants where id = new.participant_id;

  if participant_record.event_id is distinct from new.event_id then
    raise exception 'Score event_id does not match participant event_id';
  end if;

  if participant_record.category_id is distinct from new.category_id then
    raise exception 'Score category_id does not match participant category_id';
  end if;

  select event_id, category_id into heat_record from heats where id = new.heat_id;

  if heat_record.event_id is distinct from new.event_id then
    raise exception 'Score event_id does not match heat event_id';
  end if;

  if heat_record.category_id is distinct from new.category_id then
    raise exception 'Score category_id does not match heat category_id';
  end if;

  if new.judge_assignment_id is not null then
    select event_id, station_id, judge_id, active into assignment_record
    from judge_station_assignments
    where id = new.judge_assignment_id;

    if assignment_record.active is not true then
      raise exception 'Judge assignment is not active';
    end if;

    if assignment_record.event_id is distinct from new.event_id then
      raise exception 'Judge assignment event mismatch';
    end if;

    if assignment_record.station_id is distinct from new.station_id then
      raise exception 'Judge cannot score this station';
    end if;

    if new.judge_id is not null and assignment_record.judge_id is distinct from new.judge_id then
      raise exception 'Judge mismatch';
    end if;
  end if;

  return new;
end;
$$;

create trigger scores_validate_consistency before insert or update on scores
for each row execute function validate_score_consistency();

create or replace view leaderboard_station_rankings as
select
  s.event_id,
  s.category_id,
  s.station_id,
  s.participant_id,
  s.raw_score,
  rank() over (
    partition by s.event_id, s.category_id, s.station_id
    order by s.raw_score desc
  ) as station_points
from scores s
join stations st on st.id = s.station_id
join participants p on p.id = s.participant_id
where st.is_scored = true
  and st.higher_is_better = true
  and p.status not in ('withdrawn', 'dnf')
  and s.status in ('submitted', 'validated', 'corrected', 'locked');

create or replace view leaderboard_overall as
select
  l.event_id,
  l.category_id,
  l.participant_id,
  p.display_name,
  sum(l.station_points)::int as total_points,
  count(distinct l.station_id)::int as scored_stations,
  rank() over (
    partition by l.event_id, l.category_id
    order by sum(l.station_points) asc
  ) as overall_rank
from leaderboard_station_rankings l
join participants p on p.id = l.participant_id
group by l.event_id, l.category_id, l.participant_id, p.display_name;

create or replace view score_completion_status as
select
  p.event_id,
  p.category_id,
  p.id as participant_id,
  count(distinct st.id)::int as required_scores,
  count(distinct s.station_id)::int as completed_scores,
  count(distinct st.id) = count(distinct s.station_id) as is_complete
from participants p
join stations st on st.event_id = p.event_id and st.is_scored = true
left join scores s
  on s.event_id = p.event_id
  and s.participant_id = p.id
  and s.station_id = st.id
  and s.status in ('submitted', 'validated', 'corrected', 'locked')
where p.status not in ('withdrawn', 'dnf')
group by p.event_id, p.category_id, p.id;

alter table profiles enable row level security;
alter table events enable row level security;
alter table event_admins enable row level security;
alter table event_settings enable row level security;
alter table categories enable row level security;
alter table stations enable row level security;
alter table participants enable row level security;
alter table participant_members enable row level security;
alter table heats enable row level security;
alter table heat_participants enable row level security;
alter table judges enable row level security;
alter table judge_station_assignments enable row level security;
alter table timeline_blocks enable row level security;
alter table scorecards enable row level security;
alter table scores enable row level security;
alter table audit_logs enable row level security;

create or replace function is_event_admin(target_event_id uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from events e where e.id = target_event_id and e.owner_id = auth.uid()
  )
  or exists (
    select 1 from event_admins ea where ea.event_id = target_event_id and ea.user_id = auth.uid()
  );
$$;

create policy "profiles self read" on profiles for select using (id = auth.uid());
create policy "profiles self insert" on profiles for insert with check (id = auth.uid());

create policy "events admin all" on events
for all using (is_event_admin(id)) with check (owner_id = auth.uid() or is_event_admin(id));

create policy "events public read" on events
for select using (public_leaderboard_enabled = true and status in ('published', 'live', 'completed'));

create policy "event_admins admin all" on event_admins
for all using (is_event_admin(event_id)) with check (is_event_admin(event_id));

create policy "event_settings admin all" on event_settings
for all using (is_event_admin(event_id)) with check (is_event_admin(event_id));

create policy "categories admin all" on categories
for all using (is_event_admin(event_id)) with check (is_event_admin(event_id));

create policy "categories public read" on categories
for select using (
  exists (
    select 1 from events e
    where e.id = categories.event_id
      and e.public_leaderboard_enabled = true
      and e.status in ('published', 'live', 'completed')
  )
);

create policy "stations admin all" on stations
for all using (is_event_admin(event_id)) with check (is_event_admin(event_id));

create policy "stations public read" on stations
for select using (
  exists (
    select 1 from events e
    where e.id = stations.event_id
      and e.public_leaderboard_enabled = true
      and e.status in ('published', 'live', 'completed')
  )
);

create policy "participants admin all" on participants
for all using (is_event_admin(event_id)) with check (is_event_admin(event_id));

create policy "participants public read" on participants
for select using (
  exists (
    select 1 from events e
    where e.id = participants.event_id
      and e.public_leaderboard_enabled = true
      and e.status in ('published', 'live', 'completed')
  )
);

create policy "heats admin all" on heats
for all using (is_event_admin(event_id)) with check (is_event_admin(event_id));

create policy "heat_participants admin all" on heat_participants
for all using (exists (select 1 from heats h where h.id = heat_id and is_event_admin(h.event_id)))
with check (exists (select 1 from heats h where h.id = heat_id and is_event_admin(h.event_id)));

create policy "judges admin all" on judges
for all using (is_event_admin(event_id)) with check (is_event_admin(event_id));

create policy "judge_assignments admin all" on judge_station_assignments
for all using (is_event_admin(event_id)) with check (is_event_admin(event_id));

create policy "timeline admin all" on timeline_blocks
for all using (is_event_admin(event_id)) with check (is_event_admin(event_id));

create policy "scorecards admin all" on scorecards
for all using (is_event_admin(event_id)) with check (is_event_admin(event_id));

create policy "scores admin all" on scores
for all using (is_event_admin(event_id)) with check (is_event_admin(event_id));

create policy "scores public read" on scores
for select using (
  exists (
    select 1 from events e
    where e.id = scores.event_id
      and e.public_leaderboard_enabled = true
      and e.status in ('published', 'live', 'completed')
  )
);

create policy "audit admin read" on audit_logs
for select using (is_event_admin(event_id));
