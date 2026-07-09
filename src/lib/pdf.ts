import type { PdfPage } from './types.ts';
import type { Category, Heat, HeatParticipant, Participant } from './types.ts';
import { formatDuration } from './timeline.ts';

export interface TimelinePdfRow {
  categoryName: string;
  slotNumber: number;
  startsAt: string;
  estimatedFinishAt: string;
  laneLabel: string;
  participantName: string;
  startInterval: string;
  courseDuration: string;
  notes: string;
}

export function paginatePdfRows<T>(rows: T[], rowsPerPage: number): PdfPage<T>[] {
  if (!Number.isInteger(rowsPerPage) || rowsPerPage <= 0) {
    throw new Error('rowsPerPage must be a positive integer');
  }

  if (rows.length === 0) {
    return [{ pageNumber: 1, rows: [] }];
  }

  const pages: PdfPage<T>[] = [];

  for (let index = 0; index < rows.length; index += rowsPerPage) {
    pages.push({
      pageNumber: pages.length + 1,
      rows: rows.slice(index, index + rowsPerPage),
    });
  }

  return pages;
}

export function sanitizePdfText(value: string, maxLength = 80): string {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function buildTimelinePdfRows(input: {
  categories: Category[];
  heats: Heat[];
  heatParticipants: HeatParticipant[];
  participants: Participant[];
  startIntervalSeconds?: number;
  courseDurationSeconds?: number;
  transitionMinutes?: number;
}): TimelinePdfRow[] {
  const categoryById = new Map(input.categories.map((category) => [category.id, category]));
  const participantById = new Map(input.participants.map((participant) => [participant.id, participant]));
  const lanesByHeatId = new Map<string, HeatParticipant[]>();

  for (const lane of input.heatParticipants) {
    const lanes = lanesByHeatId.get(lane.heatId) ?? [];
    lanes.push(lane);
    lanesByHeatId.set(lane.heatId, lanes);
  }

  return [...input.heats]
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.heatNumber - b.heatNumber)
    .flatMap((heat) => {
      const category = categoryById.get(heat.categoryId);
      const lanes = [...(lanesByHeatId.get(heat.id) ?? [])].sort((a, b) => a.laneNumber - b.laneNumber);

      return lanes.map((lane) => ({
        categoryName: category?.name ?? heat.categoryId,
        slotNumber: heat.heatNumber,
        startsAt: heat.startsAt,
        estimatedFinishAt: heat.endsAt,
        laneLabel: lane.laneLabel ?? `Lane ${lane.laneNumber}`,
        participantName: sanitizePdfText(participantById.get(lane.participantId)?.displayName ?? lane.participantId, 56),
        startInterval: input.startIntervalSeconds ? formatDuration(input.startIntervalSeconds) : '',
        courseDuration: input.courseDurationSeconds ? formatDuration(input.courseDurationSeconds) : '',
        notes:
          input.startIntervalSeconds && input.courseDurationSeconds
            ? `Start ogni ${formatDuration(input.startIntervalSeconds)} · Percorso ${formatDuration(input.courseDurationSeconds)}`
            : input.transitionMinutes && input.transitionMinutes > 0
              ? `Pausa ${input.transitionMinutes} min dopo heat`
              : '',
      }));
    });
}
