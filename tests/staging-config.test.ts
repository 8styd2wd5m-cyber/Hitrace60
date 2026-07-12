import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('staging configuration files', () => {
  it('.env.example usa placeholder sicuri e fallback demo spento', () => {
    const envExample = readFileSync(join(process.cwd(), '.env.example'), 'utf8');

    expect(envExample).toContain('NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co');
    expect(envExample).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key');
    expect(envExample).toContain('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
    expect(envExample).toContain('NEXT_PUBLIC_APP_URL=https://your-staging-domain.vercel.app');
    expect(envExample).toContain('NEXT_PUBLIC_JUDGE_BASE_URL=https://your-staging-domain.vercel.app');
    expect(envExample).toContain('ALLOW_DEMO_FALLBACK=false');
    expect(envExample).not.toContain('192.168.');
    expect(envExample).not.toContain('localhost');
    expect(envExample).not.toContain('127.0.0.1');
  });

  it('supabase/config.toml esiste, non contiene segreti e non abilita seed demo', () => {
    const configPath = join(process.cwd(), 'supabase/config.toml');

    expect(existsSync(configPath)).toBe(true);

    const config = readFileSync(configPath, 'utf8');

    expect(config).toContain('project_id = "hitrace60-local"');
    expect(config).toContain('[db.migrations]');
    expect(config).toContain('[db.seed]');
    expect(config).toContain('enabled = false');
    expect(config).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(config).not.toContain('your-service-role-key');
    expect(config).not.toContain('<STAGING_DB_PASSWORD>');
    expect(config).not.toContain('supabase.co');
  });

  it('migration 0001-0006 restano presenti', () => {
    for (const migration of [
      '0001_initial_schema.sql',
      '0002_scorecards_unique_index.sql',
      '0003_enable_scores_realtime.sql',
      '0004_event_editions.sql',
      '0005_rbac_rls_hardening.sql',
      '0006_event_admins_self_read_profiles_self_update.sql',
    ]) {
      expect(existsSync(join(process.cwd(), 'supabase/migrations', migration))).toBe(true);
    }
  });
});
