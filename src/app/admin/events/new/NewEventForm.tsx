'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createEventEditionAction, type CreateEventEditionInput } from './actions';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function NewEventForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('HITRACE60 Settembre 2026');
  const [editionLabel, setEditionLabel] = useState('Settembre 2026');
  const [slug, setSlug] = useState('hitrace60-settembre-2026');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [timezone, setTimezone] = useState('Europe/Rome');
  const [defaultLaneCount, setDefaultLaneCount] = useState(6);
  const [createJudges, setCreateJudges] = useState(true);

  const slugValid = useMemo(() => slugPattern.test(slug), [slug]);

  function submit() {
    const input: CreateEventEditionInput = {
      createJudges,
      defaultLaneCount,
      editionLabel,
      endsAt,
      location,
      name,
      slug,
      startsAt,
      timezone,
    };

    setError(null);
    startTransition(async () => {
      const result = await createEventEditionAction(input);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(result.redirectTo);
    });
  }

  function updateName(value: string) {
    setName(value);

    if (!slug || slug === slugify(name)) {
      setSlug(slugify(value));
    }
  }

  return (
    <section className="rounded-lg bg-white p-5 shadow-sm">
      {error ? (
        <div className="mb-5 rounded-md bg-red-50 p-4 text-sm font-bold text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <label className="text-sm font-bold">
          Nome evento
          <input
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
            onChange={(event) => updateName(event.target.value)}
            value={name}
          />
        </label>

        <label className="text-sm font-bold">
          Edition label
          <input
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
            onChange={(event) => setEditionLabel(event.target.value)}
            placeholder="Es. Settembre 2026"
            value={editionLabel}
          />
        </label>

        <label className="text-sm font-bold">
          Slug
          <input
            className={`mt-2 w-full rounded-md border px-3 py-3 font-mono ${
              slugValid ? 'border-zinc-300' : 'border-red-400 bg-red-50'
            }`}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
            value={slug}
          />
          <span className="mt-1 block text-xs text-zinc-500">Solo lettere minuscole, numeri e trattini.</span>
        </label>

        <label className="text-sm font-bold">
          Location
          <input
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Es. Rimini Wellness"
            value={location}
          />
        </label>

        <label className="text-sm font-bold">
          Data/ora inizio
          <input
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
            onChange={(event) => setStartsAt(event.target.value)}
            type="datetime-local"
            value={startsAt}
          />
        </label>

        <label className="text-sm font-bold">
          Data/ora fine
          <input
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
            onChange={(event) => setEndsAt(event.target.value)}
            type="datetime-local"
            value={endsAt}
          />
        </label>

        <label className="text-sm font-bold">
          Timezone
          <input
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
            onChange={(event) => setTimezone(event.target.value)}
            value={timezone}
          />
        </label>

        <label className="text-sm font-bold">
          Default lane count
          <input
            className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
            min={1}
            onChange={(event) => setDefaultLaneCount(Number(event.target.value))}
            type="number"
            value={defaultLaneCount}
          />
        </label>
      </div>

      <label className="mt-5 flex items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm font-bold">
        <input
          checked={createJudges}
          className="mt-1 h-5 w-5"
          onChange={(event) => setCreateJudges(event.target.checked)}
          type="checkbox"
        />
        <span>
          Crea 8 giudici/token standard
          <span className="mt-1 block font-semibold text-zinc-500">
            Utile per avere subito QR e link in Live Links. Non crea scorecard né dati gara.
          </span>
        </span>
      </label>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          className="rounded-md bg-red-600 px-5 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={isPending || !slugValid}
          onClick={submit}
          type="button"
        >
          {isPending ? 'Creazione...' : 'Crea edizione'}
        </button>
        <p className="text-sm font-semibold text-zinc-500">
          Verranno creati solo evento, settings, categorie e stazioni. Partecipanti, heat, timeline e scores resteranno vuoti.
        </p>
      </div>
    </section>
  );
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
