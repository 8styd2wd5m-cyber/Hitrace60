import Link from 'next/link';
import { listAdminEvents } from '@/lib/events-data.ts';

export const dynamic = 'force-dynamic';

export default async function AdminEventsPage() {
  const events = await listAdminEvents();

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-red-600">Admin</p>
            <h1 className="mt-2 text-4xl font-black md:text-5xl">Edizioni HITRACE60</h1>
            <p className="mt-2 max-w-2xl text-zinc-600">
              Punto d&apos;ingresso unico per aprire dashboard evento, display e moduli admin.
            </p>
          </div>
          <div className="flex gap-2">
            <Link className="rounded-md bg-red-600 px-4 py-3 font-bold text-white" href="/admin/events/new">
              Nuova edizione
            </Link>
            <Link className="rounded-md bg-zinc-950 px-4 py-3 font-bold text-white" href="/">
              Home
            </Link>
          </div>
        </header>

        <section className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <div className="grid min-w-[1120px] grid-cols-[1.4fr_1fr_1fr_130px_220px_360px] gap-3 border-b border-zinc-200 bg-zinc-950 px-4 py-3 text-sm font-black uppercase text-white">
            <span>Edizione</span>
            <span>Data</span>
            <span>Location</span>
            <span>Stato</span>
            <span>Conteggi</span>
            <span>Azioni</span>
          </div>
          {events.map((event) => (
            <article
              className="grid min-w-[1120px] grid-cols-[1.4fr_1fr_1fr_130px_220px_360px] items-center gap-3 border-b border-zinc-100 px-4 py-4"
              key={event.id}
            >
              <div>
                <h2 className="text-xl font-black">{event.name}</h2>
                <p className="mt-1 text-sm font-bold text-zinc-500">{event.editionLabel ?? 'Edizione senza label'}</p>
                <p className="mt-1 font-mono text-xs text-zinc-500">/{event.routeId}</p>
              </div>
              <span className="font-semibold text-zinc-600">
                {formatDate(event.startsAt)}
                <br />
                <span className="text-xs text-zinc-400">{formatDate(event.endsAt)}</span>
              </span>
              <span className="font-semibold text-zinc-600">{event.location ?? '-'}</span>
              <span className="rounded-md bg-lime-100 px-3 py-2 text-center text-sm font-black uppercase text-lime-950">{event.status}</span>
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-black text-zinc-600">
                <Metric value={event.counts.participants} label="iscritti" />
                <Metric value={event.counts.heats} label="heat" />
                <Metric value={event.counts.scores} label="score" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className="rounded-md bg-zinc-950 px-3 py-2 font-bold text-white" href={`/admin/events/${event.routeId}`}>
                  Dashboard
                </Link>
                <Link className="rounded-md bg-zinc-100 px-3 py-2 font-bold text-zinc-950" href={`/admin/events/${event.routeId}/timeline`}>
                  Timeline
                </Link>
                <Link className="rounded-md bg-zinc-100 px-3 py-2 font-bold text-zinc-950" href={`/admin/events/${event.routeId}/participants`}>
                  Partecipanti
                </Link>
                <Link className="rounded-md bg-zinc-100 px-3 py-2 font-bold text-zinc-950" href={`/admin/events/${event.routeId}/links`}>
                  Live links
                </Link>
                <Link className="rounded-md bg-zinc-100 px-3 py-2 font-bold text-zinc-950" href={`/display/${event.routeId}`}>
                  Display
                </Link>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <span className="rounded-md bg-zinc-100 px-2 py-2">
      <strong className="block text-base text-zinc-950">{value}</strong>
      {label}
    </span>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '-';

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
