export type AdminActionErrorCode =
  | 'auth_config_missing'
  | 'not_authenticated'
  | 'not_authorized'
  | 'event_not_found'
  | 'event_state_not_allowed'
  | 'invalid_role'
  | 'invalid_input'
  | 'permission_denied'
  | 'service_config_missing';

const publicMessages: Record<AdminActionErrorCode, string> = {
  auth_config_missing: 'Configurazione autenticazione mancante.',
  event_not_found: 'Evento non trovato.',
  event_state_not_allowed: "Operazione non consentita nello stato attuale dell'evento.",
  invalid_role: 'Ruolo evento non valido.',
  invalid_input: 'Dati non validi.',
  not_authenticated: 'Sessione scaduta: effettua di nuovo il login.',
  not_authorized: 'Non sei autorizzato a modificare questa edizione.',
  permission_denied: 'Permesso insufficiente per questa operazione.',
  service_config_missing: 'Configurazione Supabase server mancante.',
};

export class AdminActionError extends Error {
  code: AdminActionErrorCode;

  constructor(code: AdminActionErrorCode, message = publicMessages[code]) {
    super(message);
    this.code = code;
    this.name = 'AdminActionError';
  }
}

export function getAdminActionErrorMessage(error: unknown): string {
  if (error instanceof AdminActionError) {
    return error.message;
  }

  return 'Operazione non riuscita.';
}

export function getAdminActionErrorCode(error: unknown): AdminActionErrorCode | 'unknown' {
  return error instanceof AdminActionError ? error.code : 'unknown';
}
