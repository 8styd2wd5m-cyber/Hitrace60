import Link from 'next/link';
import { NewEventForm } from './NewEventForm';

export const dynamic = 'force-dynamic';

export default function NewAdminEventPage() {
  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-red-600">Admin</p>
            <h1 className="mt-2 text-4xl font-black md:text-5xl">Nuova edizione</h1>
            <p className="mt-2 max-w-2xl text-zinc-600">
              Crea un evento HITRACE60 vuoto, pronto per iscritti, timeline e gara reale.
            </p>
          </div>
          <Link className="rounded-md bg-zinc-950 px-4 py-3 font-bold text-white" href="/admin/events">
            Torna alle edizioni
          </Link>
        </header>

        <NewEventForm />
      </div>
    </main>
  );
}
