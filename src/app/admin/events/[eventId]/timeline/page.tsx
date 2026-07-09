import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TimelineBuilderClient } from './TimelineBuilderClient';
import { getAdminEventRedirectForMistakenJudgeToken } from '@/lib/event-id.ts';
import { loadTimelineAdminData } from '@/lib/timeline-data.ts';

interface TimelinePageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function TimelinePage({ params }: TimelinePageProps) {
  const { eventId } = await params;
  const redirectEventId = getAdminEventRedirectForMistakenJudgeToken(eventId);

  if (redirectEventId) {
    redirect(`/admin/events/${redirectEventId}/timeline`);
  }

  const { categories, participants, resolvedEventId, source } = await loadTimelineAdminData(eventId);

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-red-600">Admin</p>
            <h1 className="text-4xl font-black">Timeline HITRACE60</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-md bg-white px-4 py-3 font-bold text-zinc-950 shadow-sm" href={`/admin/events/${eventId}`}>
              Dashboard evento
            </Link>
            <Link className="rounded-md bg-zinc-950 px-4 py-3 font-bold text-white" href="/admin/events">
              Tutte le edizioni
            </Link>
          </div>
        </header>
        <TimelineBuilderClient
          categories={categories}
          eventId={resolvedEventId}
          participants={participants}
          routeEventId={eventId}
          source={source}
        />
      </div>
    </main>
  );
}
