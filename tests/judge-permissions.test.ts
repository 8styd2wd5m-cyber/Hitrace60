import { describe, expect, it } from 'vitest';
import { canJudgeSubmitScore } from '../src/lib/judge-permissions.ts';
import type { JudgeStationAssignment, Score } from '../src/lib/types.ts';
import type { JudgeScoreSubmission } from '../src/lib/judge-permissions.ts';

describe('judge permissions', () => {
  it('permette submit valido per la propria stazione', () => {
    expect(
      canJudgeSubmitScore({
        assignment,
        submission: submission(),
        now: '2026-07-07T09:00:00.000Z',
      }),
    ).toEqual({ allowed: true });
  });

  it('blocca token invalido', () => {
    expect(canJudgeSubmitScore({ assignment: null, submission: submission() })).toEqual({
      allowed: false,
      reason: 'invalid_token',
    });
  });

  it('blocca token scaduto', () => {
    expect(
      canJudgeSubmitScore({
        assignment: { ...assignment, expiresAt: '2026-07-07T08:00:00.000Z' },
        submission: submission(),
        now: '2026-07-07T09:00:00.000Z',
      }),
    ).toEqual({ allowed: false, reason: 'expired_token' });
  });

  it('blocca stazione non assegnata', () => {
    expect(
      canJudgeSubmitScore({
        assignment,
        submission: submission({ stationId: 'station-2' }),
      }),
    ).toEqual({ allowed: false, reason: 'station_not_assigned' });
  });

  it('blocca score negativo e non numerico', () => {
    expect(canJudgeSubmitScore({ assignment, submission: submission({ rawScore: -1 }) }).reason).toBe('score_negative');
    expect(canJudgeSubmitScore({ assignment, submission: submission({ rawScore: Number.NaN }) }).reason).toBe(
      'score_not_numeric',
    );
  });

  it('blocca modifica dopo validazione o lock', () => {
    const existingScore: Score = {
      eventId: 'event-1',
      categoryId: 'cat-1',
      participantId: 'p1',
      stationId: 'station-1',
      heatId: 'heat-1',
      rawScore: 10,
      status: 'validated',
    };

    expect(canJudgeSubmitScore({ assignment, submission: submission(), existingScore }).reason).toBe(
      'score_not_editable',
    );
  });
});

const assignment: JudgeStationAssignment = {
  id: 'assignment-1',
  eventId: 'event-1',
  judgeId: 'judge-1',
  stationId: 'station-1',
  tokenHash: 'hash',
  active: true,
  expiresAt: '2026-07-09T09:00:00.000Z',
};

function submission(overrides: Partial<JudgeScoreSubmission> = {}): JudgeScoreSubmission {
  return {
    eventId: 'event-1',
    stationId: 'station-1',
    participantId: 'p1',
    heatId: 'heat-1',
    rawScore: 10,
    ...overrides,
  };
}
