import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loadAdminEventOverview } from '@/lib/events-data.ts';

export const dynamic = 'force-dynamic';

interface AdminEventDashboardPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

const activeAdminLinks = [
  {
    title: 'Partecipanti',
    description: 'Team, atleti, categorie e membri.',
    href: 'participants',
  },
  {
    title: 'Timeline',
    description: 'Start slot, lane, heat e PDF timeline.',
    href: 'timeline',
  },
  {
    title: 'Giudici',
    description: 'URL e QR per le 8 stazioni score.',
    href: 'judges',
  },
  {
    title: 'Live Links',
    description: 'Hub link gara con QR display e giudici.',
    href: 'links',
  },
];

const plannedAdminLinks = [
  {
    title: 'Scores',
    description: 'Correzione, validazione e audit log.',
    href: 'scores',
  },
  {
    title: 'Leaderboard Admin',
    description: 'Classifica live, export CSV/PDF e filtri.',
    href: 'leaderboard',
  },
];

export default async function AdminEventDashboardPage({ params }: AdminEventDashboardPageProps) {
  const { eventId } = await params;
  const result = await loadAdminEventOverview(eventId);

  if (result.status === 'redirect') {
    redirect(`/admin/events/${result.eventId}`);
  }

  if (result.status === 'not_found') {
    return (
      <main className="min-h-screen bg-zinc-100 px-5 py-8">
        <div className="mx-auto max-w-3xl rounded-lg bg-white p-6 shadow-sm">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-red-600">Admin</p>
          <h1 className="mt-2 text-4xl font-black">Evento non trovato</h1>
          <p className="mt-3 text-zinc-600">{result.message}</p>
          <Link className="mt-6 inline-block rounded-md bg-zinc-950 px-4 py-3 font-bold text-white" href="/admin/events">
            Vai alle edizioni
          </Link>
        </div>
      </main>
    );
  }

  const { event } = result;

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 rounded-lg bg-zinc-950 p-6 text-white md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-lime-300">Admin evento</p>
            <h1 className="mt-2 text-4xl font-black md:text-5xl">{event.name}</h1>
            <p className="mt-3 text-zinc-300">
              {event.location ?? 'Location non impostata'} · {formatDate(event.startsAt)} · {event.source === 'supabase' ? 'DB reale' : 'Fallback demo'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-md bg-lime-300 px-4 py-3 font-black text-zinc-950" href={`/display/${event.routeId}`}>
              Display live
            </Link>
            <Link className="rounded-md bg-white px-4 py-3 font-black text-zinc-950" href="/admin/events">
              Tutte le edizioni
            </Link>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Metric label="Stato" value={event.status} />
          <Metric label="Partecipanti" value={event.counts.participants} />
          <Metric label="Categorie" value={event.counts.categories} />
          <Metric label="Stazioni" value={event.counts.stations} />
          <Metric label="Heat" value={event.counts.heats} />
          <Metric label="Score" value={event.counts.scores} />
        </section>

        {event.status === 'completed' || event.status === 'archived' ? (
          <section className="rounded-lg bg-amber-100 p-4 font-bold text-amber-950">
            Edizione {event.status}: consultabile, modifiche operative da proteggere nei prossimi blocchi.
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          {activeAdminLinks.map((item) => (
            <Link
              className="rounded-lg bg-white p-5 text-zinc-950 shadow-sm transition hover:-translate-y-0.5"
              href={`/admin/events/${event.routeId}/${item.href}`}
              key={item.href}
            >
              <span className="text-sm font-black uppercase text-red-600">Operativo</span>
              <strong className="mt-3 block text-2xl font-black">{item.title}</strong>
              <span className="mt-2 block text-sm text-zinc-600">{item.description}</span>
            </Link>
          ))}
        </section>

        <section className="rounded-lg bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-zinc-200 pb-4 md:flex-row md:items-end">
            <div>
              <h2 className="text-2xl font-black">Prossimi collegamenti admin</h2>
              <p className="mt-1 text-sm text-zinc-500">Route previste per completare il pannello gara senza confondere token e event id.</p>
            </div>
            <Link className="rounded-md bg-zinc-950 px-4 py-3 font-bold text-white" href="/admin/events">
              Tutte le edizioni
            </Link>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {plannedAdminLinks.map((item) => (
              <div className="rounded-md border border-dashed border-zinc-300 p-4" key={item.href}>
                <p className="text-sm font-black uppercase text-zinc-400">Da creare</p>
                <h3 className="mt-2 text-xl font-black">{item.title}</h3>
                <p className="mt-1 text-sm text-zinc-500">{item.description}</p>
                <p className="mt-3 break-all rounded bg-zinc-100 px-2 py-1 font-mono text-xs">
                  /admin/events/{event.routeId}/{item.href}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <p className="text-sm font-bold uppercase text-zinc-500">{label}</p>
      <strong className="mt-1 block truncate text-2xl font-black">{value}</strong>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return 'Data non impostata';

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}
