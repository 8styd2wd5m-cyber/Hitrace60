import Link from 'next/link';
import { redirect } from 'next/navigation';
import { EventStatusControls } from './EventStatusControls';
import { EventStatusBadge, EventStatusBanner } from '@/components/admin/EventStatus.tsx';
import { loadAdminEventOverview, type AdminEventOverview } from '@/lib/events-data.ts';

export const dynamic = 'force-dynamic';

interface AdminEventDashboardPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

const actionCards = [
  {
    title: 'Partecipanti',
    description: 'Iscritti, team, membri e categorie.',
    href: 'participants',
    tone: 'dark',
  },
  {
    title: 'Timeline',
    description: 'Start slot, lane, heat e stampa PDF.',
    href: 'timeline',
    tone: 'light',
  },
  {
    title: 'Giudici',
    description: 'Stazioni assegnate, token e QR.',
    href: 'judges',
    tone: 'light',
  },
  {
    title: 'Live Links',
    description: 'Hub rapido per QR display e giudici.',
    href: 'links',
    tone: 'light',
  },
  {
    title: 'Display',
    description: 'Classifica live per megaschermo.',
    href: 'display',
    tone: 'accent',
  },
] as const;

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
  const readiness = buildReadiness(event);

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-lg bg-zinc-950 p-6 text-white shadow-sm">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-black uppercase tracking-[0.2em] text-lime-300">Race Director Cockpit</p>
                <EventStatusBadge status={event.status} />
                <span className="rounded-md bg-white/10 px-3 py-2 text-xs font-black uppercase text-zinc-200">
                  {event.source === 'supabase' ? 'DB reale' : 'Fallback demo'}
                </span>
              </div>
              <h1 className="mt-4 truncate text-4xl font-black md:text-6xl">{event.name}</h1>
              <p className="mt-2 text-2xl font-black text-red-300">{event.editionLabel ?? 'Edizione senza label'}</p>
              <dl className="mt-5 grid gap-3 text-sm text-zinc-300 md:grid-cols-2 xl:grid-cols-4">
                <HeaderFact label="Slug" value={`/${event.routeId}`} />
                <HeaderFact label="Localita" value={event.location ?? 'Non impostata'} />
                <HeaderFact label="Inizio" value={formatDateTime(event.startsAt)} />
                <HeaderFact label="Fine" value={formatDateTime(event.endsAt)} />
              </dl>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Link className="rounded-md bg-lime-300 px-4 py-3 font-black text-zinc-950" href={`/display/${event.routeId}`}>
                Apri display
              </Link>
              <Link className="rounded-md bg-white px-4 py-3 font-black text-zinc-950" href="/admin/events">
                Tutte le edizioni
              </Link>
            </div>
          </div>
        </header>

        <EventStatusBanner status={event.status} />

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <ReadyPanel readiness={readiness} />
          <RacePanel event={event} />
        </section>

        <section className="rounded-lg bg-white p-5 shadow-sm">
          <SectionTitle eyebrow="Preparazione Gara" title="Cosa serve per essere pronti" />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatusCard
              detail={event.counts.participants > 0 ? `${event.counts.participants} iscritti` : 'Nessun partecipante'}
              label="Partecipanti"
              ready={event.counts.participants > 0}
              value={event.counts.participants}
            />
            <StatusCard
              detail={event.counts.heats > 0 ? `${event.counts.heats} heat generate` : 'Timeline non generata'}
              label="Timeline"
              ready={event.counts.heats > 0}
              value={event.counts.heats}
            />
            <StatusCard
              detail={judgePreparationLabel(event)}
              label="Giudici"
              ready={event.counts.stations > 0 && event.counts.judgeAssignments >= event.counts.stations}
              value={`${Math.min(event.counts.judgeAssignments, event.counts.stations)}/${event.counts.stations}`}
            />
            <StatusCard
              detail={event.counts.judgeAssignments >= event.counts.stations ? 'QR giudici pronti' : 'Link mancanti'}
              label="Live Links"
              ready={event.counts.stations > 0 && event.counts.judgeAssignments >= event.counts.stations}
              value={event.counts.judgeAssignments}
            />
            <StatusCard detail="Route display disponibile" label="Display" ready value="Online" />
          </div>
        </section>

        <section className="rounded-lg bg-white p-5 shadow-sm">
          <SectionTitle eyebrow="Azioni Principali" title="Interventi rapidi" />
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {actionCards.map((card) => {
              const href = card.href === 'display' ? `/display/${event.routeId}` : `/admin/events/${event.routeId}/${card.href}`;

              return (
                <Link
                  className={`group flex min-h-40 flex-col justify-between rounded-lg p-5 shadow-sm transition hover:-translate-y-0.5 ${
                    card.tone === 'dark'
                      ? 'bg-zinc-950 text-white'
                      : card.tone === 'accent'
                        ? 'bg-lime-300 text-zinc-950'
                        : 'bg-zinc-50 text-zinc-950 ring-1 ring-zinc-200'
                  }`}
                  href={href}
                  key={card.title}
                >
                  <span className="text-xs font-black uppercase opacity-70">Apri</span>
                  <span>
                    <strong className="block text-2xl font-black">{card.title}</strong>
                    <span className="mt-2 block text-sm font-semibold opacity-75">{card.description}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <EventStatusControls routeEventId={event.routeId} status={event.status} />
      </div>
    </main>
  );
}

function ReadyPanel({ readiness }: { readiness: ReturnType<typeof buildReadiness> }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-zinc-200 pb-4 md:flex-row md:items-end">
        <SectionTitle eyebrow="Stato di Prontezza" title={`${readiness.percentage}% pronto`} />
        <span className={`rounded-md px-3 py-2 text-sm font-black ${readiness.missing.length ? 'bg-amber-100 text-amber-950' : 'bg-lime-200 text-lime-950'}`}>
          {readiness.missing.length ? `${readiness.missing.length} interventi richiesti` : 'Evento pronto'}
        </span>
      </div>
      <div className="mt-4 grid gap-2">
        {readiness.items.map((item) => (
          <div className="flex items-center justify-between gap-3 rounded-md bg-zinc-50 px-3 py-3" key={item.label}>
            <span className="flex items-center gap-2 font-black">
              <span className={`h-3 w-3 rounded-full ${item.ready ? 'bg-lime-500' : 'bg-amber-400'}`} />
              {item.label}
            </span>
            <span className="text-sm font-bold text-zinc-500">{item.detail}</span>
          </div>
        ))}
      </div>
      {readiness.missing.length ? (
        <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm font-bold text-amber-900">Mancano ancora: {readiness.missing.join(', ')}.</p>
      ) : null}
    </section>
  );
}

function RacePanel({ event }: { event: AdminEventOverview }) {
  return (
    <section className="rounded-lg bg-white p-5 shadow-sm">
      <SectionTitle eyebrow="Gara" title="Stato operativo" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <RaceMetric label="Score validati" value={event.counts.validatedScores || 'Non disponibile'} />
        <RaceMetric
          label="Stazioni completate"
          value={event.operations.completedStations === null ? 'Non disponibile' : `${event.operations.completedStations}/${event.counts.stations}`}
        />
        <RaceMetric label="Ultimo score" value={formatDateTime(event.operations.latestScoreAt)} />
        <RaceMetric label="Ultimo aggiornamento" value={formatDateTime(event.updatedAt)} />
      </div>
    </section>
  );
}

function StatusCard({
  detail,
  label,
  ready,
  value,
}: {
  detail: string;
  label: string;
  ready: boolean;
  value: number | string;
}) {
  return (
    <article className="rounded-lg bg-zinc-50 p-4 ring-1 ring-zinc-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black uppercase text-zinc-500">{label}</p>
        <span className={`h-3 w-3 rounded-full ${ready ? 'bg-lime-500' : 'bg-amber-400'}`} />
      </div>
      <strong className="mt-3 block truncate text-3xl font-black text-zinc-950">{value}</strong>
      <p className="mt-1 text-sm font-bold text-zinc-500">{detail}</p>
    </article>
  );
}

function RaceMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-zinc-50 p-4">
      <p className="text-xs font-black uppercase text-zinc-500">{label}</p>
      <strong className="mt-2 block truncate text-xl font-black text-zinc-950">{value}</strong>
    </div>
  );
}

function HeaderFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-black uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 truncate font-bold text-zinc-100">{value}</dd>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-black text-zinc-950">{title}</h2>
    </div>
  );
}

function buildReadiness(event: AdminEventOverview) {
  const items = [
    {
      label: 'Partecipanti',
      ready: event.counts.participants > 0,
      detail: event.counts.participants > 0 ? `${event.counts.participants} iscritti` : 'Da inserire',
    },
    {
      label: 'Timeline',
      ready: event.counts.heats > 0,
      detail: event.counts.heats > 0 ? `${event.counts.heats} heat` : 'Da generare',
    },
    {
      label: 'Giudici',
      ready: event.counts.stations > 0 && event.counts.judgeAssignments >= event.counts.stations,
      detail: judgePreparationLabel(event),
    },
    {
      label: 'Live Links',
      ready: event.counts.stations > 0 && event.counts.judgeAssignments >= event.counts.stations,
      detail: event.counts.judgeAssignments >= event.counts.stations ? 'QR pronti' : 'Da verificare',
    },
    {
      label: 'Display',
      ready: true,
      detail: 'Route pronta',
    },
  ];
  const readyCount = items.filter((item) => item.ready).length;

  return {
    items,
    missing: items.filter((item) => !item.ready).map((item) => item.label),
    percentage: Math.round((readyCount / items.length) * 100),
  };
}

function judgePreparationLabel(event: AdminEventOverview): string {
  const missing = Math.max(event.counts.stations - event.counts.judgeAssignments, 0);

  if (event.counts.stations === 0) return 'Stazioni non configurate';
  if (missing === 0) return 'Stazioni assegnate';
  if (missing === 1) return '1 stazione senza giudice';
  return `${missing} stazioni senza giudice`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Non disponibile';

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
