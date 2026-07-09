import { describe, expect, it, vi } from 'vitest';
import { hashJudgeToken, loadJudgePageData } from '../src/lib/judge-data.ts';
import { HITRACE_JUDGE_TOKENS_BY_STATION_SLUG } from '../src/lib/constants.ts';
import { getDemoJudgeAssignments } from '../src/lib/demo-data.ts';

describe('judge data loader', () => {
  it('calcola hash token stabile per gli assignment Supabase', () => {
    expect(hashJudgeToken('judge-echo-bike-demo-token')).toBe(
      '5adf3c491cc8e1f6f8461e8592183eb8b934ddf0360401ccdfbfbfe66fb948d4',
    );
  });

  it('segnala configurazione mancante fuori dal fallback development', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('NODE_ENV', 'test');

    await expect(loadJudgePageData('qualsiasi-token')).resolves.toMatchObject({
      status: 'configuration_error',
      source: 'supabase',
    });

    vi.unstubAllEnvs();
  });

  it('risolve token demo per tutte le 8 stazioni score', () => {
    const tokens = Object.values(HITRACE_JUDGE_TOKENS_BY_STATION_SLUG);

    expect(tokens).toHaveLength(8);
    expect(tokens.every((token) => getDemoJudgeAssignments(token).length === 1)).toBe(true);
    expect(getDemoJudgeAssignments('judge-ski-erg-demo-token')[0]?.stationId).toBe('station-ski-erg');
  });
});
