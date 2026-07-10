export const DEFAULT_ADMIN_REDIRECT = '/admin/events';

export function sanitizeAdminRedirect(value: string | null | undefined): string {
  if (!value) {
    return DEFAULT_ADMIN_REDIRECT;
  }

  const decodedValue = safeDecode(value);

  if (!decodedValue.startsWith('/admin')) {
    return DEFAULT_ADMIN_REDIRECT;
  }

  if (decodedValue.startsWith('//') || decodedValue.includes('://')) {
    return DEFAULT_ADMIN_REDIRECT;
  }

  return decodedValue;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
