'use server';

import { hashJudgeToken } from '@/lib/judge-data.ts';
import { createSupabaseServiceClient, hasSupabaseServerConfig } from '@/lib/supabase/server.ts';
import type { ScoreStatus } from '@/lib/types.ts';

interface ValidateJudgeScoreInput {
  token: string;
  eventId: string;
  categoryId: string;
  participantId: string;
  stationId: string;
  heatId: string;
  judgeId: string;
  judgeAssignmentId: string;
  laneNumber: number | null;
  rawScore: number;
  previousScore?: number | null;
  correctionReason?: string | null;
}

interface ReopenJudgeScoreInput {
  token: string;
  eventId: string;
  participantId: string;
  stationId: string;
  heatId: string;
  judgeAssignmentId: string;
  reason: string;
}

export interface JudgeScoreActionResult {
  ok: boolean;
  message?: string;
  scoreId?: string;
  status?: ScoreStatus;
}

export async function validateJudgeScoreAction(input: ValidateJudgeScoreInput): Promise<JudgeScoreActionResult> {
  if (!hasSupabaseServerConfig()) {
    return { ok: false, message: 'Supabase non configurato' };
  }

  if (!Number.isFinite(input.rawScore) || input.rawScore < 0) {
    return { ok: false, message: 'Score non valido' };
  }

  const supabase = createSupabaseServiceClient();
  const assignment = await getVerifiedAssignment({
    token: input.token,
    assignmentId: input.judgeAssignmentId,
    eventId: input.eventId,
    stationId: input.stationId,
  });

  if (!assignment.ok) {
    return assignment;
  }

  const { data: existingScore, error: existingError } = await supabase
    .from('scores')
    .select('id,raw_score,status')
    .eq('event_id', input.eventId)
    .eq('participant_id', input.participantId)
    .eq('station_id', input.stationId)
    .eq('heat_id', input.heatId)
    .maybeSingle();

  if (existingError) {
    return { ok: false, message: existingError.message };
  }

  if (existingScore?.status === 'validated' || existingScore?.status === 'corrected' || existingScore?.status === 'locked') {
    return { ok: false, message: 'Score gia validato o bloccato' };
  }

  const now = new Date().toISOString();
  const isCorrection = Boolean(input.correctionReason?.trim());
  const nextStatus: ScoreStatus = isCorrection ? 'corrected' : 'validated';
  const { data: upsertedScore, error: upsertError } = await supabase
    .from('scores')
    .upsert(
      {
        event_id: input.eventId,
        category_id: input.categoryId,
        participant_id: input.participantId,
        station_id: input.stationId,
        heat_id: input.heatId,
        judge_id: input.judgeId,
        judge_assignment_id: input.judgeAssignmentId,
        lane_number: input.laneNumber,
        raw_score: input.rawScore,
        status: nextStatus,
        correction_reason: input.correctionReason?.trim() || null,
        submitted_at: now,
        validated_at: now,
      },
      {
        onConflict: 'event_id,participant_id,station_id,heat_id',
      },
    )
    .select('id,status')
    .single();

  if (upsertError) {
    return { ok: false, message: upsertError.message };
  }

  const previousScore = input.previousScore ?? (existingScore ? Number(existingScore.raw_score) : null);
  await supabase.from('audit_logs').insert({
    event_id: input.eventId,
    entity_type: 'score',
    entity_id: upsertedScore.id,
    action: isCorrection ? 'corrected' : 'validated',
    actor_judge_id: input.judgeId,
    old_data: existingScore
      ? {
          raw_score: previousScore,
          status: existingScore.status,
        }
      : null,
    new_data: {
      raw_score: input.rawScore,
      status: nextStatus,
    },
    reason: input.correctionReason?.trim() || null,
  });

  return {
    ok: true,
    scoreId: upsertedScore.id,
    status: upsertedScore.status as ScoreStatus,
  };
}

export async function reopenJudgeScoreAction(input: ReopenJudgeScoreInput): Promise<JudgeScoreActionResult> {
  if (!hasSupabaseServerConfig()) {
    return { ok: false, message: 'Supabase non configurato' };
  }

  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, message: 'Nota di correzione obbligatoria' };
  }

  const supabase = createSupabaseServiceClient();
  const assignment = await getVerifiedAssignment({
    token: input.token,
    assignmentId: input.judgeAssignmentId,
    eventId: input.eventId,
    stationId: input.stationId,
  });

  if (!assignment.ok) {
    return assignment;
  }

  const { data: existingScore, error: existingError } = await supabase
    .from('scores')
    .select('id,raw_score,status,judge_id')
    .eq('event_id', input.eventId)
    .eq('participant_id', input.participantId)
    .eq('station_id', input.stationId)
    .eq('heat_id', input.heatId)
    .maybeSingle();

  if (existingError) {
    return { ok: false, message: existingError.message };
  }

  if (!existingScore) {
    return { ok: false, message: 'Score da correggere non trovato' };
  }

  if (existingScore.status === 'locked') {
    return { ok: false, message: 'Score bloccato' };
  }

  const { data: updatedScore, error: updateError } = await supabase
    .from('scores')
    .update({
      status: 'draft',
      correction_reason: reason,
      judge_assignment_id: input.judgeAssignmentId,
    })
    .eq('id', existingScore.id)
    .select('id,status')
    .single();

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  await supabase.from('audit_logs').insert({
    event_id: input.eventId,
    entity_type: 'score',
    entity_id: existingScore.id,
    action: 'corrected',
    actor_judge_id: assignment.judgeId,
    old_data: {
      raw_score: Number(existingScore.raw_score),
      status: existingScore.status,
    },
    new_data: {
      raw_score: Number(existingScore.raw_score),
      status: 'draft',
    },
    reason,
  });

  return {
    ok: true,
    scoreId: updatedScore.id,
    status: updatedScore.status as ScoreStatus,
  };
}

async function getVerifiedAssignment(input: {
  token: string;
  assignmentId: string;
  eventId: string;
  stationId: string;
}): Promise<JudgeScoreActionResult & { judgeId?: string }> {
  const supabase = createSupabaseServiceClient();
  const { data: assignment, error } = await supabase
    .from('judge_station_assignments')
    .select('id,event_id,judge_id,station_id,active,expires_at')
    .eq('id', input.assignmentId)
    .eq('token_hash', hashJudgeToken(input.token))
    .maybeSingle();

  if (error) {
    return { ok: false, message: error.message };
  }

  if (!assignment || !assignment.active) {
    return { ok: false, message: 'Token giudice non valido' };
  }

  if (assignment.expires_at && Date.parse(assignment.expires_at) <= Date.now()) {
    return { ok: false, message: 'Token giudice scaduto' };
  }

  if (assignment.event_id !== input.eventId || assignment.station_id !== input.stationId) {
    return { ok: false, message: 'Stazione non assegnata al giudice' };
  }

  return { ok: true, judgeId: assignment.judge_id };
}
