import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LinksClient } from './LinksClient';
import { EventStatusBadge, EventStatusBanner } from '@/components/admin/EventStatus.tsx';
import { loadEventLinksData } from '@/lib/event-links.ts';

export const dynamic = 'force-dynamic';

interface EventLinksPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function EventLinksPage({ params }: EventLinksPageProps) {
  const { eventId } = await params;
  const data = await loadEventLinksData(eventId);

  if ('redirectEventId' in data) {
    redirect(`/admin/events/${data.redirectEventId}/links`);
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-red-600">Admin evento</p>
            <div className="mt-2">
              <EventStatusBadge status={data.eventStatus} />
            </div>
            <h1 className="text-4xl font-black">Live Links</h1>
            <p className="mt-2 max-w-2xl text-zinc-600">
              Hub operativo per distribuire rapidamente QR e URL a display, staff e giudici.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-md bg-white px-4 py-3 font-bold text-zinc-950 shadow-sm" href={`/admin/events/${data.routeEventId}`}>
              Dashboard
            </Link>
            <Link className="rounded-md bg-zinc-950 px-4 py-3 font-bold text-white" href="/admin/events">
              Tutte le edizioni
            </Link>
          </div>
        </header>

        <EventStatusBanner status={data.eventStatus} />

        <LinksClient
          adminLinks={data.adminLinks}
          displayLink={data.displayLink}
          judgeLinks={data.judgeLinks}
          source={data.source}
        />
      </div>
    </main>
  );
}
