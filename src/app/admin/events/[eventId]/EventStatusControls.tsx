'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateEventStatusAction } from './actions';
import { EVENT_STATUS_LABELS } from '@/lib/event-status.ts';
import type { EventStatus } from '@/lib/types.ts';

interface EventStatusControlsProps {
  routeEventId: string;
  status: EventStatus;
}

const actions: Array<{ label: string; nextStatus: EventStatus; tone: 'neutral' | 'primary' | 'danger' }> = [
  { label: 'Riporta a Draft', nextStatus: 'draft', tone: 'neutral' },
  { label: 'Pubblica', nextStatus: 'published', tone: 'neutral' },
  { label: 'Avvia Live', nextStatus: 'live', tone: 'primary' },
  { label: 'Completa', nextStatus: 'completed', tone: 'danger' },
  { label: 'Archivia', nextStatus: 'archived', tone: 'danger' },
];

export function EventStatusControls({ routeEventId, status }: EventStatusControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function changeStatus(nextStatus: EventStatus) {
    if (nextStatus === status) return;

    if (nextStatus === 'completed' && !window.confirm('Confermi di completare questa edizione? Participants e timeline saranno protetti.')) {
      return;
    }

    if (nextStatus === 'archived' && !window.confirm('Confermi di archiviare questa edizione? La UI admin diventera sola lettura.')) {
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await updateEventStatusAction(routeEventId, nextStatus);
      setMessage(result.message);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-lg bg-white p-5 shadow-sm" data-testid="event-status-controls">
      <div className="flex flex-col justify-between gap-3 border-b border-zinc-200 pb-4 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-black">Stato edizione</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Stato attuale: <strong>{EVENT_STATUS_LABELS[status]}</strong>. Usa questi comandi per preparare, avviare o chiudere la gara.
          </p>
        </div>
      </div>

      {message ? <p className="mt-4 rounded-md bg-zinc-100 p-3 text-sm font-bold text-zinc-800">{message}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action) => {
          const disabled = isPending || action.nextStatus === status || (status === 'archived' && action.nextStatus !== 'archived');

          return (
            <button
              className={`rounded-md px-4 py-3 font-black disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 ${
                action.tone === 'primary'
                  ? 'bg-lime-300 text-zinc-950'
                  : action.tone === 'danger'
                    ? 'bg-red-600 text-white'
                    : 'bg-zinc-950 text-white'
              }`}
              disabled={disabled}
              key={action.nextStatus}
              onClick={() => changeStatus(action.nextStatus)}
              type="button"
            >
              {action.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
