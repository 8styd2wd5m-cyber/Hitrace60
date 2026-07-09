import type { JudgeStationAssignment, Score, UUID } from './types.ts';

export interface JudgeScoreSubmission {
  eventId: UUID;
  stationId: UUID;
  participantId: UUID;
  heatId: UUID;
  rawScore: number;
}

export interface JudgePermissionResult {
  allowed: boolean;
  reason?: string;
}

export function canJudgeSubmitScore(input: {
  assignment: JudgeStationAssignment | null;
  submission: JudgeScoreSubmission;
  existingScore?: Score | null;
  now?: string;
}): JudgePermissionResult {
  const { assignment, submission, existingScore } = input;

  if (!assignment) {
    return deny('invalid_token');
  }

  if (!assignment.active) {
    return deny('inactive_assignment');
  }

  if (assignment.expiresAt && Date.parse(assignment.expiresAt) <= Date.parse(input.now ?? new Date().toISOString())) {
    return deny('expired_token');
  }

  if (assignment.eventId !== submission.eventId) {
    return deny('event_mismatch');
  }

  if (assignment.stationId !== submission.stationId) {
    return deny('station_not_assigned');
  }

  if (!Number.isFinite(submission.rawScore)) {
    return deny('score_not_numeric');
  }

  if (submission.rawScore < 0) {
    return deny('score_negative');
  }

  if (existingScore?.status === 'validated' || existingScore?.status === 'corrected' || existingScore?.status === 'locked') {
    return deny('score_not_editable');
  }

  return { allowed: true };
}

function deny(reason: string): JudgePermissionResult {
  return { allowed: false, reason };
}
