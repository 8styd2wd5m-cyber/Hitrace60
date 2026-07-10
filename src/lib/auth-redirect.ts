export const DEFAULT_ADMIN_REDIRECT = '/admin/events';

export function sanitizeAdminRedirect(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_ADMIN_REDIRECT;
  }

  if (!value.startsWith('/admin')) {
    return DEFAULT_ADMIN_REDIRECT;
  }

  if (value.startsWith('//') || value.includes('://')) {
    return DEFAULT_ADMIN_REDIRECT;
  }

  return value;
}
