import Link from 'next/link';
import { Plus } from 'lucide-react';
import { EventsListClient } from './EventsListClient';
import { listAdminEvents } from '@/lib/events-data.ts';

export const dynamic = 'force-dynamic';

export default async function AdminEventsPage() {
  const events = await listAdminEvents();

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-5 rounded-lg bg-white p-6 shadow-sm md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-red-600">Admin</p>
            <h1 className="mt-2 text-4xl font-black md:text-5xl">Edizioni HITRACE60</h1>
            <p className="mt-2 max-w-2xl text-zinc-600">
              Gestisci le edizioni, apri dashboard evento e prepara la gara.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-3 font-black text-white" href="/admin/events/new">
              <Plus className="h-5 w-5" aria-hidden="true" />
              Nuova edizione
            </Link>
            <Link className="rounded-md bg-zinc-950 px-4 py-3 font-black text-white" href="/">
              Home
            </Link>
          </div>
        </header>

        <EventsListClient events={events} />
      </div>
    </main>
  );
}
