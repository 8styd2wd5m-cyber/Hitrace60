import { EVENT_STATUS_LABELS } from '@/lib/event-status.ts';
import type { EventStatus } from '@/lib/types.ts';

const badgeStyles: Record<EventStatus, string> = {
  archived: 'bg-zinc-800 text-white',
  completed: 'bg-sky-100 text-sky-950',
  draft: 'bg-amber-100 text-amber-950',
  live: 'bg-lime-300 text-lime-950',
  published: 'bg-red-100 text-red-800',
};

const bannerStyles: Record<EventStatus, string> = {
  archived: 'bg-zinc-900 text-white',
  completed: 'bg-sky-100 text-sky-950',
  draft: 'bg-white text-zinc-700',
  live: 'bg-red-100 text-red-900',
  published: 'bg-amber-100 text-amber-950',
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return <span className={`rounded-md px-3 py-2 text-xs font-black uppercase ${badgeStyles[status]}`}>{EVENT_STATUS_LABELS[status]}</span>;
}

export function EventStatusBanner({ status }: { status: EventStatus }) {
  const message = getStatusMessage(status);

  if (!message) {
    return null;
  }

  return (
    <section className={`rounded-lg p-4 text-sm font-bold shadow-sm ${bannerStyles[status]}`} data-testid="event-status-banner">
      {message}
    </section>
  );
}

function getStatusMessage(status: EventStatus): string | null {
  if (status === 'draft') return null;
  if (status === 'published') return 'Edizione pubblicata: modifiche consentite, verifica con attenzione prima della gara.';
  if (status === 'live') return 'Edizione live: la gara e in corso. Modifica partecipanti e timeline solo se strettamente necessario.';
  if (status === 'completed') return 'Edizione conclusa: modifiche operative protette in MVP.';
  return 'Edizione archiviata: sola lettura da interfaccia admin.';
}
