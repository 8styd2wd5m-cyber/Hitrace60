import { z } from 'zod';
import type { Category, ParticipantMember, ParticipantWithMembers, UUID } from './types.ts';

export const participantMemberInputSchema = z.object({
  firstName: z.string().trim().min(1, 'Nome membro obbligatorio'),
  lastName: z.string().trim().min(1, 'Cognome membro obbligatorio'),
  gender: z.enum(['M', 'F']),
});

export const participantInputSchema = z.object({
  id: z.string().optional(),
  eventId: z.string().min(1),
  categoryId: z.string().min(1, 'Categoria obbligatoria'),
  displayName: z.string().trim().min(1, 'Nome team/atleta obbligatorio'),
  bibNumber: z.string().trim().optional(),
  seedOrder: z.coerce.number().int().min(0),
  members: z.array(participantMemberInputSchema),
});

export type ParticipantInput = z.infer<typeof participantInputSchema>;

export interface ParticipantValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateParticipantInput(input: ParticipantInput, categories: Category[]): ParticipantValidationResult {
  const parsed = participantInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => issue.message),
    };
  }

  const category = categories.find((categoryItem) => categoryItem.id === input.categoryId);

  if (!category) {
    return {
      valid: false,
      errors: ['Categoria non valida'],
    };
  }

  if (input.members.length !== category.teamSize) {
    return {
      valid: false,
      errors: [`La categoria ${category.code} richiede ${category.teamSize} membro/i`],
    };
  }

  return {
    valid: true,
    errors: [],
  };
}

export function buildParticipantFromInput(input: ParticipantInput, categories: Category[]): ParticipantWithMembers {
  const validation = validateParticipantInput(input, categories);

  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }

  const id = input.id ?? createLocalId('participant');
  const normalizedBibNumber = input.bibNumber?.trim();

  return {
    id,
    eventId: input.eventId,
    categoryId: input.categoryId,
    displayName: input.displayName.trim(),
    bibNumber: normalizedBibNumber ? normalizedBibNumber : null,
    status: 'registered',
    seedOrder: input.seedOrder,
    members: input.members.map((member, index) => ({
      id: createLocalId(`member-${id}-${index + 1}`),
      participantId: id,
      firstName: member.firstName.trim(),
      lastName: member.lastName.trim(),
      gender: member.gender,
      memberOrder: index + 1,
    })),
  };
}

export function upsertParticipant(
  participants: ParticipantWithMembers[],
  nextParticipant: ParticipantWithMembers,
): ParticipantWithMembers[] {
  const exists = participants.some((participant) => participant.id === nextParticipant.id);

  if (!exists) {
    return [...participants, nextParticipant].sort(sortParticipants);
  }

  return participants
    .map((participant) => (participant.id === nextParticipant.id ? nextParticipant : participant))
    .sort(sortParticipants);
}

export function deleteParticipant(participants: ParticipantWithMembers[], participantId: UUID): ParticipantWithMembers[] {
  return participants.filter((participant) => participant.id !== participantId);
}

export function groupMembersByParticipant(members: ParticipantMember[]): Map<UUID, ParticipantMember[]> {
  const grouped = new Map<UUID, ParticipantMember[]>();

  for (const member of members) {
    grouped.set(member.participantId, [...(grouped.get(member.participantId) ?? []), member]);
  }

  for (const [participantId, participantMembers] of grouped) {
    grouped.set(
      participantId,
      [...participantMembers].sort((a, b) => a.memberOrder - b.memberOrder),
    );
  }

  return grouped;
}

function sortParticipants(a: ParticipantWithMembers, b: ParticipantWithMembers): number {
  return a.categoryId.localeCompare(b.categoryId) || a.seedOrder - b.seedOrder || a.displayName.localeCompare(b.displayName);
}

function createLocalId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
