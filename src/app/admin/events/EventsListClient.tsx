'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Copy, ExternalLink, LayoutDashboard, Link2, MapPin, Search, Timer, Trophy, Users } from 'lucide-react';
import { duplicateEventStructureAction, type DuplicateEventStructureInput } from './actions';
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
  const [duplicatingEvent, setDuplicatingEvent] = useState<AdminEventListItem | null>(null);

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
            <EventCard event={event} key={event.id} onDuplicate={() => setDuplicatingEvent(event)} />
          ))}
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center shadow-sm">
          <h2 className="text-2xl font-black">Nessuna edizione trovata</h2>
          <p className="mt-2 text-zinc-500">Modifica ricerca o filtro stato per vedere altre edizioni.</p>
        </section>
      )}

      {duplicatingEvent ? <DuplicateEventDialog event={duplicatingEvent} onClose={() => setDuplicatingEvent(null)} /> : null}
    </div>
  );
}

function EventCard({ event, onDuplicate }: { event: AdminEventListItem; onDuplicate: () => void }) {
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
          <button
            className="inline-flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm font-black text-red-700 transition hover:bg-red-100"
            onClick={onDuplicate}
            type="button"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Duplica struttura
          </button>
        </div>
      </div>
    </article>
  );
}

function DuplicateEventDialog({ event, onClose }: { event: AdminEventListItem; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const suggestedName = event.name.replace(/giugno 2026/i, 'Ottobre 2026');
  const [form, setForm] = useState<DuplicateEventStructureInput>(() => ({
    copyCategories: true,
    copyJudgeTokens: false,
    copyJudges: true,
    copySettings: true,
    copyStations: true,
    editionLabel: 'Ottobre 2026',
    endsAt: '',
    location: event.location ?? '',
    name: suggestedName === event.name ? `${event.name} Copy` : suggestedName,
    slug: slugify(suggestedName === event.name ? `${event.name} Copy` : suggestedName),
    sourceEventId: event.routeId,
    startsAt: '',
  }));
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof DuplicateEventStructureInput>(key: K, value: DuplicateEventStructureInput[K]) {
    setForm((currentForm) => ({
      ...currentForm,
      [key]: value,
      ...(key === 'name' ? { slug: slugify(String(value)) } : {}),
    }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await duplicateEventStructureAction(form);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(result.redirectTo);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 px-4 py-6">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white p-5 shadow-2xl">
        <div className="flex flex-col justify-between gap-3 border-b border-zinc-200 pb-4 md:flex-row md:items-start">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-red-600">Duplica struttura</p>
            <h2 className="mt-1 text-3xl font-black">{event.name}</h2>
            <p className="mt-1 text-sm font-semibold text-zinc-500">
              La nuova edizione parte senza partecipanti, heat, timeline, scorecard, scores o audit log.
            </p>
          </div>
          <button className="rounded-md bg-zinc-100 px-3 py-2 font-black" onClick={onClose} type="button">
            Chiudi
          </button>
        </div>

        {error ? <div className="mt-4 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div> : null}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TextField label="Nome evento" onChange={(value) => updateField('name', value)} value={form.name} />
          <TextField label="Edition label" onChange={(value) => updateField('editionLabel', value)} value={form.editionLabel} />
          <TextField label="Slug" onChange={(value) => updateField('slug', value.toLowerCase())} value={form.slug} />
          <TextField label="Location" onChange={(value) => updateField('location', value)} value={form.location} />
          <DateField label="Data inizio" onChange={(value) => updateField('startsAt', value)} value={form.startsAt} />
          <DateField label="Data fine" onChange={(value) => updateField('endsAt', value)} value={form.endsAt} />
        </div>

        <fieldset className="mt-5 rounded-md border border-zinc-200 p-4">
          <legend className="px-2 text-sm font-black uppercase text-zinc-500">Cosa copiare</legend>
          <div className="grid gap-3 md:grid-cols-2">
            <Checkbox label="Copia categorie" onChange={(value) => updateField('copyCategories', value)} value={form.copyCategories} />
            <Checkbox label="Copia stazioni" onChange={(value) => updateField('copyStations', value)} value={form.copyStations} />
            <Checkbox label="Copia impostazioni" onChange={(value) => updateField('copySettings', value)} value={form.copySettings} />
            <Checkbox label="Copia giudici" onChange={(value) => updateField('copyJudges', value)} value={form.copyJudges} />
            <Checkbox label="Mantieni token compatibili" onChange={(value) => updateField('copyJudgeTokens', value)} value={form.copyJudgeTokens} />
          </div>
          <p className="mt-3 text-sm font-semibold text-zinc-500">
            I token non vengono mai riutilizzati se puntano a un&apos;altra edizione: per sicurezza vengono rigenerati con il nuovo slug.
          </p>
        </fieldset>

        <div className="mt-6 flex flex-col justify-end gap-2 sm:flex-row">
          <button className="rounded-md bg-zinc-100 px-4 py-3 font-black" onClick={onClose} type="button">
            Annulla
          </button>
          <button
            className="rounded-md bg-red-600 px-4 py-3 font-black text-white disabled:bg-zinc-300"
            disabled={isPending}
            onClick={submit}
            type="button"
          >
            {isPending ? 'Duplicazione...' : 'Duplica struttura'}
          </button>
        </div>
      </section>
    </div>
  );
}

function TextField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3" onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function DateField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="text-sm font-bold">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
        onChange={(event) => onChange(event.target.value)}
        type="datetime-local"
        value={value}
      />
    </label>
  );
}

function Checkbox({ label, onChange, value }: { label: string; onChange: (value: boolean) => void; value: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-3 text-sm font-bold">
      {label}
      <input checked={value} className="h-5 w-5" onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
