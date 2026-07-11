import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/0005_rbac_rls_hardening.sql'), 'utf8');
const eventAdminsSelfReadMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/0006_event_admins_self_read_profiles_self_update.sql'),
  'utf8',
);

describe('RBAC RLS hardening migration', () => {
  it('distingue manager da reader e non tratta viewer come manager', () => {
    expect(migration).toContain('create or replace function public.is_event_manager');
    expect(migration).toContain("ea.role in ('owner', 'admin')");
    expect(migration).toContain('create or replace function public.is_event_reader');
    expect(migration).toContain("ea.role = 'viewer'");
    expect(migration).toContain('create or replace function public.is_event_admin');
    expect(migration).toContain('select public.is_event_manager(target_event_id)');
  });

  it('imposta search_path sicuro sulle funzioni security definer', () => {
    const securityDefinerFunctions = migration.match(/security definer/g) ?? [];
    const secureSearchPath = migration.match(/set search_path = public/g) ?? [];

    expect(securityDefinerFunctions.length).toBeGreaterThanOrEqual(3);
    expect(secureSearchPath).toHaveLength(securityDefinerFunctions.length);
  });

  it('protegge participant_members tramite join a participants.event_id', () => {
    expect(migration).toContain('create policy "participant_members event members read"');
    expect(migration).toContain('create policy "participant_members managers insert"');
    expect(migration).toContain('create policy "participant_members managers update"');
    expect(migration).toContain('create policy "participant_members managers delete"');
    expect(migration).toContain('from public.participants p');
    expect(migration).toContain('public.is_event_manager(p.event_id)');
  });

  it('consente audit insert solo ad actor coerente e manager evento', () => {
    expect(migration).toContain('create policy "audit managers insert"');
    expect(migration).toContain('actor_user_id = auth.uid()');
    expect(migration).toContain('public.is_event_manager(event_id)');
  });

  it('aggiunge self-read event_admins senza accesso pubblico o mutation viewer', () => {
    expect(eventAdminsSelfReadMigration).toContain('create policy "event_admins self read"');
    expect(eventAdminsSelfReadMigration).toContain('for select using (user_id = auth.uid())');
    expect(eventAdminsSelfReadMigration).not.toContain('for all');
    expect(eventAdminsSelfReadMigration).not.toContain('role = ');
  });

  it('consente update del solo profilo autenticato', () => {
    expect(eventAdminsSelfReadMigration).toContain('create policy "profiles self update"');
    expect(eventAdminsSelfReadMigration).toContain('for update using (id = auth.uid())');
    expect(eventAdminsSelfReadMigration).toContain('with check (id = auth.uid())');
  });
});
