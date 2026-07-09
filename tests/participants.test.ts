import { describe, expect, it } from 'vitest';
import {
  buildParticipantFromInput,
  deleteParticipant,
  groupMembersByParticipant,
  upsertParticipant,
  validateParticipantInput,
} from '../src/lib/participants.ts';
import type { Category, ParticipantMember, ParticipantWithMembers } from '../src/lib/types.ts';

describe('participants utilities', () => {
  it('valida team size in base alla categoria', () => {
    const result = validateParticipantInput(
      {
        eventId: 'event-1',
        categoryId: 'cat-mm',
        displayName: 'Team Test',
        seedOrder: 1,
        members: [{ firstName: 'A', lastName: 'One', gender: 'M' }],
      },
      categories,
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('richiede 2');
  });

  it('costruisce partecipante con membri normalizzati', () => {
    const participant = buildParticipantFromInput(
      {
        eventId: 'event-1',
        categoryId: 'cat-mf',
        displayName: ' Team Mixed ',
        bibNumber: ' 42 ',
        seedOrder: 3,
        members: [
          { firstName: ' Alex ', lastName: ' Rossi ', gender: 'M' },
          { firstName: ' Bianca ', lastName: ' Verdi ', gender: 'F' },
        ],
      },
      categories,
    );

    expect(participant.displayName).toBe('Team Mixed');
    expect(participant.bibNumber).toBe('42');
    expect(participant.members.map((member) => member.memberOrder)).toEqual([1, 2]);
  });

  it('aggiorna e cancella partecipanti localmente', () => {
    const base = participant('p1', 'Team Old');
    const updated = { ...base, displayName: 'Team New' };

    expect(upsertParticipant([base], updated)[0].displayName).toBe('Team New');
    expect(deleteParticipant([updated], 'p1')).toEqual([]);
  });

  it('raggruppa membri per partecipante ordinandoli', () => {
    const members: ParticipantMember[] = [
      member('m2', 'p1', 2),
      member('m1', 'p1', 1),
      member('m3', 'p2', 1),
    ];

    expect(groupMembersByParticipant(members).get('p1')?.map((item) => item.id)).toEqual(['m1', 'm2']);
  });
});

const categories: Category[] = [
  {
    id: 'cat-mm',
    eventId: 'event-1',
    code: 'MM',
    name: 'Team MM',
    type: 'team_2',
    teamSize: 2,
    startOrder: 1,
  },
  {
    id: 'cat-mf',
    eventId: 'event-1',
    code: 'MF',
    name: 'Team MF',
    type: 'team_2',
    teamSize: 2,
    startOrder: 2,
  },
];

function participant(id: string, displayName: string): ParticipantWithMembers {
  return {
    id,
    eventId: 'event-1',
    categoryId: 'cat-mm',
    displayName,
    status: 'registered',
    seedOrder: 1,
    members: [member('member-1', id, 1)],
  };
}

function member(id: string, participantId: string, memberOrder: number): ParticipantMember {
  return {
    id,
    participantId,
    firstName: `Name ${memberOrder}`,
    lastName: 'Test',
    gender: 'M',
    memberOrder,
  };
}
