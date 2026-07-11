drop policy if exists "event_admins self read" on public.event_admins;
create policy "event_admins self read" on public.event_admins
for select using (user_id = auth.uid());

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
for update using (id = auth.uid())
with check (id = auth.uid());
