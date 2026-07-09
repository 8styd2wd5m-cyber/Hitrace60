'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { DISPLAY_LEADERBOARD_SCORE_STATUSES } from '@/lib/constants.ts';
import { calculateLeaderboard } from '@/lib/leaderboard.ts';
import { createSupabaseBrowserClient, hasSupabaseBrowserConfig } from '@/lib/supabase/client.ts';
import type { Category, Heat, LeaderboardRow, Participant, Score, Station } from '@/lib/types.ts';

type DisplayMode = 'ranking' | 'stations' | 'multi';
type RealtimeStatus = 'disabled' | 'connecting' | 'live' | 'error';

interface LeaderboardDisplayClientProps {
  categories: Category[];
  heats: Heat[];
  participants: Participant[];
  resolvedEventId: string;
  scores: Score[];
  source: 'supabase' | 'demo';
  stations: Station[];
}

export function LeaderboardDisplayClient({
  categories,
  heats,
  participants,
  resolvedEventId,
  scores,
  source,
  stations,
}: LeaderboardDisplayClientProps) {
  const router = useRouter();
  const scoredStations = stations
    .filter((station) => station.active && station.isScored)
    .sort((a, b) => a.stationOrder - b.stationOrder);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(() => categories.map((category) => category.id));
  const [mode, setMode] = useState<DisplayMode>('ranking');
  const [mounted, setMounted] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>(source === 'supabase' ? 'connecting' : 'disabled');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLastUpdatedAt(new Date());
  }, [scores, heats]);

  useEffect(() => {
    setSelectedCategoryIds((currentIds) => {
      const categoryIds = categories.map((category) => category.id);
      const categoryIdSet = new Set(categoryIds);
      const retainedIds = currentIds.filter((categoryId) => categoryIdSet.has(categoryId));

      return retainedIds.length ? retainedIds : categoryIds;
    });
  }, [categories]);

  useEffect(() => {
    if (source !== 'supabase' || !hasSupabaseBrowserConfig()) {
      setRealtimeStatus(source === 'supabase' ? 'error' : 'disabled');
      return;
    }

    setRealtimeStatus('connecting');
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`display-scores-${resolvedEventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scores',
          filter: `event_id=eq.${resolvedEventId}`,
        },
        () => {
          setLastUpdatedAt(new Date());
          router.refresh();
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('live');
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeStatus('error');
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [resolvedEventId, router, source]);

  useEffect(() => {
    if (source !== 'supabase') {
      return;
    }

    const interval = window.setInterval(() => {
      setLastUpdatedAt(new Date());
      router.refresh();
    }, 10000);

    return () => window.clearInterval(interval);
  }, [router, source]);

  const selectedCategories = categories.filter((category) => selectedCategoryIds.includes(category.id));
  const leaderboards = useMemo(
    () =>
      selectedCategories.map((category) => ({
        category,
        rows: calculateLeaderboard(scores, participants, stations, category.id, {
          includedScoreStatuses: [...DISPLAY_LEADERBOARD_SCORE_STATUSES],
        }),
      })),
    [participants, scores, selectedCategories, stations],
  );
  const primary = leaderboards[0];
  const liveScoresCount = scores.filter((score) => selectedCategoryIds.includes(score.categoryId)).length;
  const currentHeat = heats.find((heat) => heat.status === 'current');

  function toggleCategory(categoryId: string) {
    setSelectedCategoryIds((currentIds) => {
      if (currentIds.length === categories.length) {
        return [categoryId];
      }

      if (currentIds.includes(categoryId)) {
        return currentIds.length === 1 ? currentIds : currentIds.filter((id) => id !== categoryId);
      }

      return [...currentIds, categoryId];
    });
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-5 text-white">
      <div className="mx-auto flex max-w-[1800px] flex-col gap-6">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-5">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div>
              <div className="flex items-center gap-3">
                <span className="rounded bg-red-600 px-3 py-1 text-lg font-black">LIVE</span>
                <span className="text-sm font-bold uppercase tracking-[0.25em] text-lime-300">Leaderboard HITRACE60</span>
              </div>
              <h1 className="mt-3 text-5xl font-black leading-none md:text-7xl">
                {selectedCategories.length === categories.length
                  ? 'Tutte le categorie'
                  : selectedCategories.map((category) => category.code).join(' + ')}
              </h1>
            </div>
            <div className="text-left xl:text-right">
              <p className="text-lg font-bold text-zinc-300">Ultimo aggiornamento</p>
              {!mounted || !lastUpdatedAt ? (
                <time className="text-3xl font-black tabular-nums" dateTime="" data-testid="display-timestamp">
                  --:--:--
                </time>
              ) : (
                <time className="text-3xl font-black tabular-nums" dateTime={lastUpdatedAt.toISOString()} data-testid="display-timestamp">
                  {lastUpdatedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </time>
              )}
              <p className="mt-1 text-sm font-semibold text-zinc-400">
                Heat corrente: {currentHeat ? `#${currentHeat.heatNumber}` : 'non impostata'} · score validi: {liveScoresCount} ·{' '}
                {source === 'supabase' ? 'DB reale' : 'fallback senza score demo'} · {realtimeLabel(realtimeStatus)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded-md px-4 py-3 text-lg font-black ${
                selectedCategoryIds.length === categories.length ? 'bg-lime-300 text-zinc-950' : 'bg-white/10 text-white'
              }`}
              data-testid="display-all-categories"
              onClick={() => setSelectedCategoryIds(categories.map((category) => category.id))}
              type="button"
            >
              Tutte live
            </button>
            {categories.map((category) => (
              <button
                className={`rounded-md px-4 py-3 text-lg font-black ${
                  selectedCategoryIds.includes(category.id) ? 'bg-white text-zinc-950' : 'bg-white/10 text-white'
                }`}
                data-testid={`display-category-${category.code}`}
                key={category.id}
                onClick={() => toggleCategory(category.id)}
                type="button"
              >
                {category.code}
              </button>
            ))}
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {[
              ['ranking', 'Classifica'],
              ['stations', 'Dettaglio stazioni'],
              ['multi', 'Multi-categoria'],
            ].map(([value, label]) => (
              <button
                className={`h-14 rounded-md text-lg font-black ${
                  mode === value ? 'bg-lime-300 text-zinc-950' : 'bg-zinc-800 text-white'
                }`}
                data-testid={`display-mode-${value}`}
                key={value}
                onClick={() => setMode(value as DisplayMode)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {mode === 'ranking' && primary ? (
          <RankingMode category={primary.category} rows={primary.rows} stations={scoredStations} />
        ) : null}

        {mode === 'stations' && primary ? (
          <StationsMode category={primary.category} rows={primary.rows} stations={scoredStations} />
        ) : null}

        {mode === 'multi' ? <MultiCategoryMode leaderboards={leaderboards} stations={scoredStations} /> : null}

        <footer className="flex items-center justify-between text-sm text-zinc-400">
          <span>{realtimeFooter(realtimeStatus)}</span>
          <Link className="font-bold text-lime-300" href="/">
            Home
          </Link>
        </footer>
      </div>
    </main>
  );
}

function realtimeLabel(status: RealtimeStatus): string {
  if (status === 'live') return 'Realtime attivo';
  if (status === 'connecting') return 'Realtime connessione';
  if (status === 'error') return 'Realtime non disponibile';
  return 'Realtime disattivato';
}

function realtimeFooter(status: RealtimeStatus): string {
  if (status === 'live') return 'Supabase Realtime attivo su scores.';
  if (status === 'connecting') return 'Connessione a Supabase Realtime in corso.';
  if (status === 'error') return 'Realtime non disponibile: il display resta leggibile, ma richiede refresh manuale.';
  return 'Fallback demo: Realtime non attivo.';
}

function RankingMode({ category, rows, stations }: { category: Category; rows: LeaderboardRow[]; stations: Station[] }) {
  return (
    <section className="grid gap-3" data-testid="leaderboard-display">
      <h2 className="sr-only">{category.name}</h2>
      {rows.map((row, index) => (
        <article
          className="grid grid-cols-[64px_1fr] items-center gap-3 rounded-lg bg-white px-4 py-4 text-zinc-950 shadow-lg xl:grid-cols-[90px_1fr_160px_160px_420px]"
          key={row.participantId}
        >
          <span className="text-5xl font-black xl:text-6xl">{index + 1}</span>
          <div className="min-w-0">
            <h3 className="truncate text-3xl font-black xl:text-5xl">{row.participantName}</h3>
            <p className="mt-1 text-lg font-semibold text-zinc-500">
              {row.completedStations}/{row.requiredStations} stazioni completate
            </p>
          </div>
          <strong className="text-5xl font-black xl:text-right">{row.totalPoints}</strong>
          <span className={`rounded-md px-3 py-2 text-center text-lg font-black ${row.isComplete ? 'bg-lime-300' : 'bg-zinc-200'}`}>
            {row.isComplete ? 'FINAL' : 'LIVE'}
          </span>
          <StationMiniBreakdown row={row} stations={stations} />
        </article>
      ))}
    </section>
  );
}

function StationsMode({ category, rows, stations }: { category: Category; rows: LeaderboardRow[]; stations: Station[] }) {
  return (
    <section className="overflow-x-auto rounded-lg bg-white text-zinc-950" data-testid="display-stations-mode">
      <div className="min-w-[1180px]">
        <div className="grid grid-cols-[260px_120px_repeat(8,minmax(95px,1fr))] border-b border-zinc-200 bg-zinc-100 text-sm font-black uppercase">
          <div className="p-3">{category.name}</div>
          <div className="p-3">Totale</div>
          {stations.map((station) => (
            <div className="p-3" key={station.id}>
              {station.name}
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div className="grid grid-cols-[260px_120px_repeat(8,minmax(95px,1fr))] border-b border-zinc-100" key={row.participantId}>
            <div className="truncate p-3 text-xl font-black">{row.participantName}</div>
            <div className="p-3 text-xl font-black">{row.totalPoints}</div>
            {stations.map((station) => {
              const result = row.stationResults.find((item) => item.stationId === station.id);

              return (
                <div className={`p-3 font-bold ${result?.rankPoints ? 'bg-lime-50' : 'bg-zinc-50 text-zinc-400'}`} key={station.id}>
                  {result?.rankPoints ? (
                    <>
                      <span className="block text-lg">#{result.rankPoints}</span>
                      <span className="text-xs">
                        {result.rawScore} {station.scoreUnit}
                      </span>
                    </>
                  ) : (
                    'missing'
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function MultiCategoryMode({
  leaderboards,
  stations,
}: {
  leaderboards: Array<{ category: Category; rows: LeaderboardRow[] }>;
  stations: Station[];
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-2" data-testid="display-multi-mode">
      {leaderboards.map(({ category, rows }) => (
        <article className="rounded-lg bg-white p-4 text-zinc-950" key={category.id}>
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-3">
            <h2 className="text-3xl font-black">{category.name}</h2>
            <span className="rounded bg-zinc-950 px-3 py-2 text-xl font-black text-white">{category.code}</span>
          </div>
          <div className="mt-3 grid gap-2">
            {rows.slice(0, 5).map((row, index) => (
              <div className="grid grid-cols-[48px_1fr_80px] items-center gap-2 rounded-md bg-zinc-100 p-3" key={row.participantId}>
                <span className="text-3xl font-black">{index + 1}</span>
                <div className="min-w-0">
                  <h3 className="truncate text-2xl font-black">{row.participantName}</h3>
                  <p className="text-sm font-semibold text-zinc-500">
                    {row.completedStations}/{stations.length} stazioni
                  </p>
                </div>
                <strong className="text-3xl font-black">{row.totalPoints}</strong>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function StationMiniBreakdown({ row, stations }: { row: LeaderboardRow; stations: Station[] }) {
  return (
    <div className="hidden grid-cols-8 gap-1 xl:grid" data-testid={`station-breakdown-${row.participantId}`}>
      {stations.map((station) => {
        const result = row.stationResults.find((item) => item.stationId === station.id);

        return (
          <div
            className={`rounded px-2 py-2 text-center text-xs font-black ${
              result?.rankPoints ? 'bg-lime-200 text-zinc-950' : 'bg-zinc-200 text-zinc-500'
            }`}
            key={station.id}
            title={station.name}
          >
            <span className="block truncate">{station.slug.replaceAll('-', ' ')}</span>
            <span className="text-lg">{result?.rankPoints ? `#${result.rankPoints}` : '-'}</span>
          </div>
        );
      })}
    </div>
  );
}
