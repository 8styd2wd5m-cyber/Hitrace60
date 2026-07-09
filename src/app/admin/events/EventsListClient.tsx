'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ExternalLink, LayoutDashboard, Link2, MapPin, Search, Timer, Trophy, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AdminEventListItem } from '@/lib/events-data.ts';
import type { EventStatus } from '@/lib/types.ts';

interface EventsListClientProps {
  events: AdminEventListItem[];
}

const statusOptions: Array<{ label: string; value: 'all' | EventStatus }> = [
  { label: 'Tutte', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Live', value: 'live' },
  { label: 'Completed', value: 'completed' },
  { label: 'Archived', value: 'archived' },
];

const statusStyles: Record<EventStatus, string> = {
  archived: 'bg-zinc-200 text-zinc-700',
  completed: 'bg-sky-100 text-sky-900',
  draft: 'bg-amber-100 text-amber-950',
  live: 'bg-lime-200 text-lime-950',
  published: 'bg-red-100 text-red-800',
};

export function EventsListClient({ events }: EventsListClientProps) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | EventStatus>('all');

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return events.filter((event) => {
      const matchesStatus = status === 'all' || event.status === status;
      const searchableText = [event.name, event.editionLabel, event.location, event.routeId].filter(Boolean).join(' ').toLowerCase();
      const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [events, query, status]);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_360px] lg:items-end">
          <label className="text-sm font-black text-zinc-700">
            Cerca edizione
            <span className="mt-2 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-3">
              <Search className="h-5 w-5 text-zinc-400" aria-hidden="true" />
              <input
                className="w-full bg-transparent font-semibold text-zinc-950 outline-none placeholder:text-zinc-400"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nome, location o slug"
                value={query}
              />
            </span>
          </label>

          <fieldset className="text-sm font-black text-zinc-700">
            <legend>Stato</legend>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3">
              {statusOptions.map((option) => (
                <button
                  className={`rounded-md px-3 py-2 text-sm font-black transition ${
                    status === option.value ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                  key={option.value}
                  onClick={() => setStatus(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <p className="text-sm font-bold text-zinc-500">
          {filteredEvents.length} di {events.length} edizioni visibili
        </p>
        <p className="text-sm font-semibold text-zinc-400">Usa le card per entrare subito nel flusso gara corretto.</p>
      </div>

      {filteredEvents.length ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {filteredEvents.map((event) => (
            <EventCard event={event} key={event.id} />
          ))}
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center shadow-sm">
          <h2 className="text-2xl font-black">Nessuna edizione trovata</h2>
          <p className="mt-2 text-zinc-500">Modifica ricerca o filtro stato per vedere altre edizioni.</p>
        </section>
      )}
    </div>
  );
}

function EventCard({ event }: { event: AdminEventListItem }) {
  return (
    <article className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-zinc-100">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={event.status} />
            <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-black uppercase text-zinc-500">
              {event.source === 'supabase' ? 'DB reale' : 'Fallback demo'}
            </span>
          </div>
          <h2 className="mt-3 truncate text-3xl font-black text-zinc-950">{event.name}</h2>
          <p className="mt-1 text-lg font-black text-red-600">{event.editionLabel ?? 'Edizione senza label'}</p>
          <p className="mt-2 truncate font-mono text-xs text-zinc-400">/{event.routeId}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <CountPill icon={<Users className="h-4 w-4" />} label="Partecipanti" value={event.counts.participants} />
          <CountPill icon={<Timer className="h-4 w-4" />} label="Heat" value={event.counts.heats} />
          <CountPill icon={<Trophy className="h-4 w-4" />} label="Score" value={event.counts.scores} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 border-y border-zinc-100 py-4 md:grid-cols-3">
        <InfoItem icon={<MapPin className="h-5 w-5" />} label="Location" value={event.location ?? 'Location non impostata'} />
        <InfoItem icon={<CalendarDays className="h-5 w-5" />} label="Inizio" value={formatDate(event.startsAt)} />
        <InfoItem icon={<CalendarDays className="h-5 w-5" />} label="Fine" value={formatDate(event.endsAt)} />
      </div>

      <div className="mt-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <p className="text-xs font-semibold text-zinc-400">Ultimo aggiornamento: {formatDateTime(event.updatedAt)}</p>
        <div className="flex flex-wrap gap-2">
          <ActionLink href={`/admin/events/${event.routeId}`} icon={<LayoutDashboard className="h-4 w-4" />} label="Apri dashboard" primary />
          <ActionLink href={`/admin/events/${event.routeId}/participants`} label="Partecipanti" />
          <ActionLink href={`/admin/events/${event.routeId}/timeline`} label="Timeline" />
          <ActionLink href={`/admin/events/${event.routeId}/judges`} label="Giudici" />
          <ActionLink href={`/admin/events/${event.routeId}/links`} icon={<Link2 className="h-4 w-4" />} label="Live Links" />
          <ActionLink href={`/display/${event.routeId}`} icon={<ExternalLink className="h-4 w-4" />} label="Display" />
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: EventStatus }) {
  return <span className={`rounded-md px-3 py-2 text-xs font-black uppercase ${statusStyles[status]}`}>{status}</span>;
}

function CountPill({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md bg-zinc-100 px-3 py-2">
      <span className="mx-auto flex items-center justify-center text-zinc-500">{icon}</span>
      <strong className="mt-1 block text-xl font-black text-zinc-950">{value}</strong>
      <span className="block text-[11px] font-black uppercase text-zinc-500">{label}</span>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className="mt-0.5 text-zinc-400">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs font-black uppercase text-zinc-400">{label}</span>
        <strong className="block truncate text-sm font-black text-zinc-800">{value}</strong>
      </span>
    </div>
  );
}

function ActionLink({
  href,
  icon,
  label,
  primary = false,
}: {
  href: string;
  icon?: ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-black transition ${
        primary ? 'bg-zinc-950 text-white hover:bg-zinc-800' : 'bg-zinc-100 text-zinc-950 hover:bg-zinc-200'
      }`}
      href={href}
    >
      {icon}
      {label}
    </Link>
  );
}

function formatDate(value: string | null): string {
  if (!value) return 'Non impostata';

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'non disponibile';

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
