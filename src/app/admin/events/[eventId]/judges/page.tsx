import Link from 'next/link';
import { redirect } from 'next/navigation';
import { JudgesAdminClient } from './JudgesAdminClient';
import { loadEventLinksData } from '@/lib/event-links.ts';

interface JudgesPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function JudgesPage({ params }: JudgesPageProps) {
  const { eventId } = await params;
  const data = await loadEventLinksData(eventId);

  if ('redirectEventId' in data) {
    redirect(`/admin/events/${data.redirectEventId}/judges`);
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-red-600">Admin</p>
            <h1 className="text-4xl font-black">URL giudici HITRACE60</h1>
            <p className="mt-2 max-w-2xl text-zinc-600">
              Link locali per smartphone giudici. Ogni token apre una sola stazione e usa il race station order reale.
            </p>
          </div>
          <div className="flex gap-2">
            <Link className="rounded-md bg-white px-4 py-3 font-bold text-zinc-950 shadow-sm" href={`/admin/events/${eventId}/timeline`}>
              Timeline
            </Link>
            <Link className="rounded-md bg-lime-300 px-4 py-3 font-bold text-zinc-950 shadow-sm" href={`/admin/events/${eventId}/links`}>
              Live Links
            </Link>
            <Link className="rounded-md bg-zinc-950 px-4 py-3 font-bold text-white" href="/admin/events">
              Tutte le edizioni
            </Link>
          </div>
        </header>
        <JudgesAdminClient links={data.judgeLinks} />
      </div>
    </main>
  );
}
