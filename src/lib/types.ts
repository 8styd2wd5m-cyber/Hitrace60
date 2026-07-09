export type UUID = string;

export type EventStatus = 'draft' | 'published' | 'live' | 'completed' | 'archived';

export type CategoryCode = 'M' | 'F' | 'MM' | 'MF' | 'FF' | 'MMM' | 'MMF';

export type CategoryType = 'individual' | 'team_2' | 'team_3';

export type ParticipantStatus = 'registered' | 'checked_in' | 'withdrawn' | 'dnf';

export type HeatStatus = 'scheduled' | 'current' | 'completed' | 'locked';

export type ScoreStatus = 'draft' | 'submitted' | 'validated' | 'corrected' | 'locked';

export type TimelineBlockType = 'heat' | 'break' | 'custom' | 'briefing' | 'ceremony';

export type ScorecardStatus = 'generated' | 'printed' | 'used' | 'void';

export interface Category {
  id: UUID;
  eventId: UUID;
  code: CategoryCode;
  name: string;
  type: CategoryType;
  teamSize: 1 | 2 | 3;
  raceDay?: string | null;
  startOrder: number;
}

export interface Station {
  id: UUID;
  eventId: UUID;
  name: string;
  slug: string;
  stationOrder: number;
  raceStationOrder?: number;
  scoreType: 'numeric' | string;
  scoreUnit: string;
  isScored: boolean;
  higherIsBetter: boolean;
  active: boolean;
}

export interface Participant {
  id: UUID;
  eventId: UUID;
  categoryId: UUID;
  displayName: string;
  bibNumber?: string | null;
  status: ParticipantStatus;
  seedOrder: number;
}

export interface ParticipantMember {
  id: UUID;
  participantId: UUID;
  firstName: string;
  lastName: string;
  gender?: 'M' | 'F' | null;
  memberOrder: number;
}

export interface ParticipantWithMembers extends Participant {
  members: ParticipantMember[];
}

export interface Heat {
  id: UUID;
  eventId: UUID;
  categoryId: UUID;
  heatNumber: number;
  startsAt: string;
  endsAt: string;
  laneCount: number;
  status: HeatStatus;
}

export interface HeatParticipant {
  id: UUID;
  heatId: UUID;
  participantId: UUID;
  laneNumber: number;
  laneLabel?: string | null;
}

export interface TimelineBlock {
  id: UUID;
  eventId: UUID;
  heatId?: UUID | null;
  categoryId?: UUID | null;
  blockType: TimelineBlockType;
  title: string;
  raceDay?: string | null;
  startsAt: string;
  endsAt: string;
  sortOrder: number;
  notes?: string | null;
}

export interface Score {
  id?: UUID;
  eventId: UUID;
  categoryId: UUID;
  participantId: UUID;
  stationId: UUID;
  heatId?: UUID;
  judgeId?: UUID | null;
  judgeAssignmentId?: UUID | null;
  laneNumber?: number | null;
  rawScore: number;
  status?: ScoreStatus;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface StationResult {
  stationId: UUID;
  stationName: string;
  rawScore: number | null;
  rankPoints: number | null;
  rankPosition: number | null;
}

export interface LeaderboardRow {
  participantId: UUID;
  participantName: string;
  categoryId: UUID;
  totalPoints: number;
  stationResults: StationResult[];
  completedStations: number;
  requiredStations: number;
  isComplete: boolean;
}

export interface JudgeSession {
  assignmentId: UUID;
  eventId: UUID;
  judgeId: UUID;
  judgeName: string;
  stationId: UUID;
  stationName: string;
  active: boolean;
}

export interface JudgeStationAssignment {
  id: UUID;
  eventId: UUID;
  judgeId: UUID;
  judgeName?: string;
  stationId: UUID;
  tokenHash: string;
  active: boolean;
  expiresAt?: string | null;
}

export interface Scorecard {
  id: UUID;
  eventId: UUID;
  judgeAssignmentId: UUID;
  stationId: UUID;
  heatId: UUID;
  participantId: UUID;
  laneNumber: number;
  status: ScorecardStatus;
}

export interface JudgeScorecardRow {
  id: UUID;
  eventId: UUID;
  judgeAssignmentId: UUID;
  stationId: UUID;
  stationName: string;
  heatId: UUID;
  heatNumber: number;
  heatStartsAt: string;
  teamStartAt: string;
  stationArrivalAt: string;
  raceStationOrder: number;
  participantId: UUID;
  participantName: string;
  categoryId: UUID;
  categoryName?: string;
  laneNumber: number;
  laneLabel?: string | null;
  scoreUnit: string;
  scoreId?: UUID | null;
  rawScore: number;
  scoreStatus: ScoreStatus | 'missing';
}

export interface JudgeStationScorecards {
  assignment: JudgeStationAssignment;
  station: Station;
  scorecards: JudgeScorecardRow[];
}

export interface PdfPage<T> {
  pageNumber: number;
  rows: T[];
}
