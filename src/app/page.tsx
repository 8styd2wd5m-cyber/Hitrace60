import Link from 'next/link';
import { DEMO_EVENT_ID, DEMO_JUDGE_TOKEN } from '@/lib/demo-data.ts';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-10">
        <header className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-lime-300">HITRACE60 MVP</p>
          <h1 className="max-w-3xl text-5xl font-black leading-none sm:text-7xl">Race control, leaderboard e giudici</h1>
          <p className="max-w-2xl text-lg text-zinc-300">
            Base operativa demo per verificare ranking, inserimento score mobile e generazione timeline.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <Link
            className="rounded-lg border border-white/15 bg-white p-5 text-zinc-950 transition hover:-translate-y-0.5"
            href={`/display/${DEMO_EVENT_ID}`}
          >
            <span className="text-sm font-bold uppercase text-red-600">Megaschermo</span>
            <strong className="mt-3 block text-2xl">Leaderboard live</strong>
            <span className="mt-2 block text-sm text-zinc-600">Classifica demo leggibile da lontano.</span>
          </Link>
          <Link
            className="rounded-lg border border-white/15 bg-lime-300 p-5 text-zinc-950 transition hover:-translate-y-0.5"
            href={`/judge/${DEMO_JUDGE_TOKEN}`}
          >
            <span className="text-sm font-bold uppercase text-zinc-700">Giudice</span>
            <strong className="mt-3 block text-2xl">Score mobile</strong>
            <span className="mt-2 block text-sm text-zinc-700">Inserimento touch-friendly per Echo Bike.</span>
          </Link>
          <Link
            className="rounded-lg border border-white/15 bg-zinc-900 p-5 text-white transition hover:-translate-y-0.5"
            href={`/admin/events/${DEMO_EVENT_ID}/timeline`}
          >
            <span className="text-sm font-bold uppercase text-lime-300">Admin</span>
            <strong className="mt-3 block text-2xl">Timeline builder</strong>
            <span className="mt-2 block text-sm text-zinc-400">Heat automatiche collegate alla logica core.</span>
          </Link>
          <Link
            className="rounded-lg border border-white/15 bg-white/10 p-5 text-white transition hover:-translate-y-0.5"
            href={`/admin/events/${DEMO_EVENT_ID}/participants`}
          >
            <span className="text-sm font-bold uppercase text-lime-300">Admin</span>
            <strong className="mt-3 block text-2xl">Partecipanti</strong>
            <span className="mt-2 block text-sm text-zinc-400">CRUD team, atleti e membri.</span>
          </Link>
        </section>
      </div>
    </main>
  );
}
