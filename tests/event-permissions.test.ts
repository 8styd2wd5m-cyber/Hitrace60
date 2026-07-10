import { describe, expect, it } from 'vitest';
import { EVENT_ROLE_PERMISSIONS, type EventPermission } from '../src/lib/auth/action-auth.ts';

const mutationPermissions: EventPermission[] = [
  'admins.manage',
  'event.delete',
  'event.duplicate',
  'event.update_status',
  'judges.manage',
  'participants.manage',
  'scores.correct',
  'timeline.manage',
];

const readPermissions: EventPermission[] = [
  'event.read',
  'judges.read',
  'participants.read',
  'scores.read',
  'timeline.read',
];

describe('event role permissions matrix', () => {
  it('owner possiede tutti i permessi previsti', () => {
    for (const permission of [...mutationPermissions, ...readPermissions]) {
      expect(EVENT_ROLE_PERMISSIONS.owner).toContain(permission);
    }
  });

  it('admin gestisce la gara ma non elimina eventi o amministra owner/admin', () => {
    expect(EVENT_ROLE_PERMISSIONS.admin).toContain('event.duplicate');
    expect(EVENT_ROLE_PERMISSIONS.admin).toContain('event.update_status');
    expect(EVENT_ROLE_PERMISSIONS.admin).toContain('participants.manage');
    expect(EVENT_ROLE_PERMISSIONS.admin).toContain('timeline.manage');
    expect(EVENT_ROLE_PERMISSIONS.admin).toContain('judges.manage');
    expect(EVENT_ROLE_PERMISSIONS.admin).toContain('scores.correct');
    expect(EVENT_ROLE_PERMISSIONS.admin).not.toContain('event.delete');
    expect(EVENT_ROLE_PERMISSIONS.admin).not.toContain('admins.manage');
  });

  it('viewer possiede solo permessi di lettura', () => {
    expect(EVENT_ROLE_PERMISSIONS.viewer).toEqual(readPermissions);

    for (const permission of mutationPermissions) {
      expect(EVENT_ROLE_PERMISSIONS.viewer).not.toContain(permission);
    }
  });
});
