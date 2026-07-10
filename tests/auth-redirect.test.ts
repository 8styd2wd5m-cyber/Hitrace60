import { describe, expect, it } from 'vitest';
import { DEFAULT_ADMIN_REDIRECT, sanitizeAdminRedirect } from '../src/lib/auth-redirect.ts';

describe('sanitizeAdminRedirect', () => {
  it('accetta solo redirect relativi sotto /admin', () => {
    expect(sanitizeAdminRedirect('/admin/events/demo-event/timeline')).toBe('/admin/events/demo-event/timeline');
  });

  it('usa fallback per valori esterni o non admin', () => {
    expect(sanitizeAdminRedirect('https://example.com/admin')).toBe(DEFAULT_ADMIN_REDIRECT);
    expect(sanitizeAdminRedirect('//example.com/admin')).toBe(DEFAULT_ADMIN_REDIRECT);
    expect(sanitizeAdminRedirect('https%3A%2F%2Fevil.com')).toBe(DEFAULT_ADMIN_REDIRECT);
    expect(sanitizeAdminRedirect('%2F%2Fevil.com')).toBe(DEFAULT_ADMIN_REDIRECT);
    expect(sanitizeAdminRedirect('/display/demo-event')).toBe(DEFAULT_ADMIN_REDIRECT);
    expect(sanitizeAdminRedirect(null)).toBe(DEFAULT_ADMIN_REDIRECT);
  });
});
