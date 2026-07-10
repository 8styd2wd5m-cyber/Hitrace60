create or replace function public.is_event_manager(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event_id
      and e.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.event_admins ea
    where ea.event_id = target_event_id
      and ea.user_id = auth.uid()
      and ea.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_event_reader(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_event_manager(target_event_id)
  or exists (
    select 1
    from public.event_admins ea
    where ea.event_id = target_event_id
      and ea.user_id = auth.uid()
      and ea.role = 'viewer'
  );
$$;

create or replace function public.is_event_admin(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_event_manager(target_event_id);
$$;

drop policy if exists "events admin all" on public.events;
create policy "events event members read" on public.events
for select using (public.is_event_reader(id));
create policy "events owner insert" on public.events
for insert with check (owner_id = auth.uid());
create policy "events managers update" on public.events
for update using (public.is_event_manager(id))
with check (owner_id = auth.uid() or public.is_event_manager(id));
create policy "events owner delete" on public.events
for delete using (owner_id = auth.uid());

drop policy if exists "event_settings event members read" on public.event_settings;
create policy "event_settings event members read" on public.event_settings
for select using (public.is_event_reader(event_id));

drop policy if exists "categories event members read" on public.categories;
create policy "categories event members read" on public.categories
for select using (public.is_event_reader(event_id));

drop policy if exists "stations event members read" on public.stations;
create policy "stations event members read" on public.stations
for select using (public.is_event_reader(event_id));

drop policy if exists "participants event members read" on public.participants;
create policy "participants event members read" on public.participants
for select using (public.is_event_reader(event_id));

drop policy if exists "participant_members event members read" on public.participant_members;
create policy "participant_members event members read" on public.participant_members
for select using (
  exists (
    select 1
    from public.participants p
    where p.id = participant_id
      and public.is_event_reader(p.event_id)
  )
);

drop policy if exists "participant_members managers insert" on public.participant_members;
create policy "participant_members managers insert" on public.participant_members
for insert with check (
  exists (
    select 1
    from public.participants p
    where p.id = participant_id
      and public.is_event_manager(p.event_id)
  )
);

drop policy if exists "participant_members managers update" on public.participant_members;
create policy "participant_members managers update" on public.participant_members
for update using (
  exists (
    select 1
    from public.participants p
    where p.id = participant_id
      and public.is_event_manager(p.event_id)
  )
) with check (
  exists (
    select 1
    from public.participants p
    where p.id = participant_id
      and public.is_event_manager(p.event_id)
  )
);

drop policy if exists "participant_members managers delete" on public.participant_members;
create policy "participant_members managers delete" on public.participant_members
for delete using (
  exists (
    select 1
    from public.participants p
    where p.id = participant_id
      and public.is_event_manager(p.event_id)
  )
);

drop policy if exists "heats event members read" on public.heats;
create policy "heats event members read" on public.heats
for select using (public.is_event_reader(event_id));

drop policy if exists "heat_participants event members read" on public.heat_participants;
create policy "heat_participants event members read" on public.heat_participants
for select using (
  exists (
    select 1
    from public.heats h
    where h.id = heat_id
      and public.is_event_reader(h.event_id)
  )
);

drop policy if exists "judges event members read" on public.judges;
create policy "judges event members read" on public.judges
for select using (public.is_event_reader(event_id));

drop policy if exists "judge_assignments event members read" on public.judge_station_assignments;
create policy "judge_assignments event members read" on public.judge_station_assignments
for select using (public.is_event_reader(event_id));

drop policy if exists "timeline event members read" on public.timeline_blocks;
create policy "timeline event members read" on public.timeline_blocks
for select using (public.is_event_reader(event_id));

drop policy if exists "scorecards event members read" on public.scorecards;
create policy "scorecards event members read" on public.scorecards
for select using (public.is_event_reader(event_id));

drop policy if exists "scores event members read" on public.scores;
create policy "scores event members read" on public.scores
for select using (public.is_event_reader(event_id));

drop policy if exists "audit managers insert" on public.audit_logs;
create policy "audit managers insert" on public.audit_logs
for insert with check (
  actor_user_id = auth.uid()
  and public.is_event_manager(event_id)
);
