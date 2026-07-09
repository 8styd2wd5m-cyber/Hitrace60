'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { DISPLAY_LEADERBOARD_SCORE_STATUSES } from '@/lib/constants.ts';
import { calculateLeaderboard } from '@/lib/leaderboard.ts';
import { createSupabaseBrowserClient, hasSupabaseBrowserConfig } from '@/lib/supabase/client.ts';
import type { DisplayEvent } from '@/lib/display-data.ts';
import type { Category, Heat, LeaderboardRow, Participant, Score, Station } from '@/lib/types.ts';

type DisplayMode = 'ranking' | 'stations' | 'multi';
type RealtimeStatus = 'disabled' | 'connecting' | 'live' | 'error';

interface LeaderboardDisplayClientProps {
  categories: Category[];
  event: DisplayEvent;
  heats: Heat[];
  participants: Participant[];
  resolvedEventId: string;
  scores: Score[];
  source: 'supabase' | 'demo';
  stations: Station[];
}

export function LeaderboardDisplayClient({
  categories,
  event,
  heats,
  participants,
  resolvedEventId,
  scores,
  source,
  stations,
}: LeaderboardDisplayClientProps) {
  const router = useRouter();
  const scoredStations = useMemo(
    () => stations.filter((station) => station.active && station.isScored).sort((a, b) => a.stationOrder - b.stationOrder),
    [stations],
  );
  const categoriesWithParticipants = useMemo(
    () => categories.filter((category) => participants.some((participant) => participant.categoryId === category.id)),
    [categories, participants],
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(() => categoriesWithParticipants.map((category) => category.id));
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

      if (retainedIds.length) return retainedIds;

      const participantCategoryIds = categoriesWithParticipants.map((category) => category.id);
      return participantCategoryIds.length ? [participantCategoryIds[0]] : categoryIds.slice(0, 1);
    });
  }, [categories, categoriesWithParticipants]);

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
  const visibleCategories = selectedCategories.length ? selectedCategories : categoriesWithParticipants.slice(0, 1);
  const rankingCategory = visibleCategories[0] ?? categoriesWithParticipants[0] ?? categories[0] ?? null;
  const leaderboards = useMemo(
    () =>
      visibleCategories.map((category) => ({
        category,
        rows: calculateLeaderboard(scores, participants, stations, category.id, {
          includedScoreStatuses: [...DISPLAY_LEADERBOARD_SCORE_STATUSES],
        }),
      })),
    [participants, scores, stations, visibleCategories],
  );
  const rankingRows = useMemo(
    () =>
      rankingCategory
        ? calculateLeaderboard(scores, participants, stations, rankingCategory.id, {
            includedScoreStatuses: [...DISPLAY_LEADERBOARD_SCORE_STATUSES],
          })
        : [],
    [participants, rankingCategory, scores, stations],
  );
  const liveScoresCount = scores.filter((score) => visibleCategories.some((category) => category.id === score.categoryId)).length;
  const currentHeat = heats.find((heat) => heat.status === 'current');

  function toggleCategory(categoryId: string) {
    setSelectedCategoryIds((currentIds) => {
      const selectableIds = categories.map((category) => category.id);

      if (currentIds.length === selectableIds.length) {
        return [categoryId];
      }

      if (currentIds.includes(categoryId)) {
        return currentIds.length === 1 ? currentIds : currentIds.filter((id) => id !== categoryId);
      }

      return [...currentIds, categoryId];
    });
  }

  function selectAllCategories() {
    const ids = categoriesWithParticipants.length ? categoriesWithParticipants.map((category) => category.id) : categories.map((category) => category.id);
    setSelectedCategoryIds(ids);
  }

  return (
    <main className="min-h-screen bg-[#08080a] p-5 text-white">
      <div className="mx-auto flex max-w-[1900px] flex-col gap-6">
        <DisplayHeader
          currentHeat={currentHeat}
          event={event}
          lastUpdatedAt={lastUpdatedAt}
          liveScoresCount={liveScoresCount}
          mode={mode}
          mounted={mounted}
          realtimeStatus={realtimeStatus}
          selectedCategories={visibleCategories}
          source={source}
        />

        <CategorySelector
          categories={categories}
          onSelectAll={selectAllCategories}
          onToggle={toggleCategory}
          participants={participants}
          selectedCategoryIds={selectedCategoryIds}
        />

        <ModeSelector mode={mode} setMode={setMode} />

        {categories.length === 0 ? (
          <EmptyState title="Categorie non configurate" message="Il display e pronto, ma questa edizione non ha ancora categorie." />
        ) : null}

        {mode === 'ranking' && rankingCategory ? (
          <RankingMode
            category={rankingCategory}
            multipleSelected={visibleCategories.length > 1}
            rows={rankingRows}
            scores={scores}
            stations={scoredStations}
          />
        ) : null}

        {mode === 'stations' ? (
          <StationsMode categories={visibleCategories} participants={participants} scores={scores} stations={scoredStations} />
        ) : null}

        {mode === 'multi' ? <MultiCategoryMode leaderboards={leaderboards} stations={scoredStations} /> : null}

        <footer className="flex items-center justify-between text-sm text-zinc-500">
          <span>{realtimeFooter(realtimeStatus)}</span>
          <Link className="font-bold text-red-400" href="/">
            Home
          </Link>
        </footer>
      </div>
    </main>
  );
}

function DisplayHeader({
  currentHeat,
  event,
  lastUpdatedAt,
  liveScoresCount,
  mode,
  mounted,
  realtimeStatus,
  selectedCategories,
  source,
}: {
  currentHeat: Heat | undefined;
  event: DisplayEvent;
  lastUpdatedAt: Date | null;
  liveScoresCount: number;
  mode: DisplayMode;
  mounted: boolean;
  realtimeStatus: RealtimeStatus;
  selectedCategories: Category[];
  source: 'supabase' | 'demo';
}) {
  const modeLabel = mode === 'ranking' ? 'Classifica Live' : mode === 'multi' ? 'Multi Categoria' : 'Dettaglio Stazioni';

  return (
    <header className="rounded-xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl shadow-black/30">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-md px-3 py-2 text-sm font-black uppercase ${event.status === 'live' ? 'bg-red-600' : 'bg-zinc-800'}`}>
              {event.status === 'live' ? '● LIVE' : event.status}
            </span>
            <span className="text-sm font-black uppercase tracking-[0.25em] text-red-300">HITRACE60 Display</span>
            <span className="rounded-md bg-white/10 px-3 py-2 text-xs font-black uppercase text-zinc-300">{modeLabel}</span>
          </div>
          <h1 className="mt-4 truncate text-5xl font-black leading-none md:text-7xl">
            {event.name}
            {event.editionLabel ? <span className="text-red-400"> — {event.editionLabel}</span> : null}
          </h1>
          <p className="mt-3 text-lg font-bold text-zinc-400">
            Categorie: {selectedCategories.length ? selectedCategories.map((category) => category.code).join(' + ') : 'nessuna'} · Heat{' '}
            {currentHeat ? `#${currentHeat.heatNumber}` : 'non impostata'} · Score validi {liveScoresCount}
          </p>
        </div>

        <div className="rounded-lg bg-black/30 p-4 text-left xl:text-right">
          <p className="text-sm font-black uppercase text-zinc-500">Ultimo aggiornamento</p>
          {!mounted || !lastUpdatedAt ? (
            <time className="text-4xl font-black tabular-nums" dateTime="" data-testid="display-timestamp">
              --:--:--
            </time>
          ) : (
            <time className="text-4xl font-black tabular-nums" dateTime={lastUpdatedAt.toISOString()} data-testid="display-timestamp">
              {lastUpdatedAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </time>
          )}
          <p className="mt-2 text-sm font-bold text-zinc-400">
            {source === 'supabase' ? 'DB reale' : 'fallback demo'} · {realtimeLabel(realtimeStatus)}
          </p>
        </div>
      </div>
    </header>
  );
}

function CategorySelector({
  categories,
  onSelectAll,
  onToggle,
  participants,
  selectedCategoryIds,
}: {
  categories: Category[];
  onSelectAll: () => void;
  onToggle: (categoryId: string) => void;
  participants: Participant[];
  selectedCategoryIds: string[];
}) {
  const allSelected = categories.length > 0 && selectedCategoryIds.length === categories.length;

  return (
    <section className="flex flex-wrap gap-2">
      <button
        className={`rounded-md px-4 py-3 text-lg font-black ${allSelected ? 'bg-red-600 text-white' : 'bg-white/10 text-white'}`}
        data-testid="display-all-categories"
        onClick={onSelectAll}
        type="button"
      >
        Tutte live
      </button>
      {categories.map((category) => {
        const participantCount = participants.filter((participant) => participant.categoryId === category.id).length;

        return (
          <button
            className={`rounded-md px-4 py-3 text-lg font-black ${
              selectedCategoryIds.includes(category.id) ? 'bg-white text-zinc-950' : 'bg-white/10 text-white'
            }`}
            data-testid={`display-category-${category.code}`}
            key={category.id}
            onClick={() => onToggle(category.id)}
            type="button"
          >
            {category.code}
            <span className="ml-2 text-xs opacity-60">{participantCount}</span>
          </button>
        );
      })}
    </section>
  );
}

function ModeSelector({ mode, setMode }: { mode: DisplayMode; setMode: (mode: DisplayMode) => void }) {
  return (
    <section className="grid gap-2 md:grid-cols-3">
      {[
        ['ranking', 'Classifica Live', 'Categoria singola, pubblico'],
        ['multi', 'Multi Categoria', 'Overview speaker/regia'],
        ['stations', 'Dettaglio Stazioni', 'Score per stazione'],
      ].map(([value, label, helper]) => (
        <button
          className={`rounded-lg border p-4 text-left transition ${
            mode === value ? 'border-red-500 bg-red-600 text-white' : 'border-white/10 bg-zinc-900 text-zinc-200'
          }`}
          data-testid={`display-mode-${value}`}
          key={value}
          onClick={() => setMode(value as DisplayMode)}
          type="button"
        >
          <span className="block text-xl font-black">{label}</span>
          <span className="mt-1 block text-sm font-bold opacity-70">{helper}</span>
        </button>
      ))}
    </section>
  );
}

function RankingMode({
  category,
  multipleSelected,
  rows,
  scores,
  stations,
}: {
  category: Category;
  multipleSelected: boolean;
  rows: LeaderboardRow[];
  scores: Score[];
  stations: Station[];
}) {
  const leaderPoints = rows[0]?.totalPoints ?? 0;

  if (rows.length === 0) {
    return <EmptyState title={`${category.name}: nessun partecipante`} message="Aggiungi partecipanti per mostrare la classifica live." />;
  }

  return (
    <section className="grid gap-4" data-testid="leaderboard-display">
      <div className="flex flex-col justify-between gap-2 border-b border-white/10 pb-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.25em] text-red-300">Classifica Live</p>
          <h2 className="mt-1 text-4xl font-black">{category.name}</h2>
        </div>
        {multipleSelected ? (
          <p className="rounded-md bg-amber-300 px-3 py-2 text-sm font-black text-zinc-950">
            Selezione multipla attiva: classifica mostrata su {category.code}.
          </p>
        ) : null}
      </div>

      {rows.map((row, index) => {
        const latest = latestScoreForParticipant(row.participantId, scores, stations);
        const gap = row.totalPoints - leaderPoints;

        return (
          <article
            className={`grid gap-4 rounded-xl border p-5 shadow-2xl ${
              index === 0 ? 'border-red-500 bg-white text-zinc-950 shadow-red-950/30' : 'border-white/10 bg-zinc-900 text-white'
            } xl:grid-cols-[110px_1fr_180px_320px] xl:items-center`}
            key={row.participantId}
          >
            <div className="flex items-center gap-4 xl:block">
              <span className={`text-7xl font-black leading-none ${index === 0 ? 'text-red-600' : 'text-white'}`}>#{index + 1}</span>
              {index === 0 ? <span className="rounded bg-red-600 px-2 py-1 text-xs font-black text-white xl:mt-2 xl:inline-block">LEADER</span> : null}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-4xl font-black md:text-6xl">{row.participantName}</h3>
              <p className={`mt-2 text-xl font-bold ${index === 0 ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {row.totalPoints} pts · {row.completedStations}/{row.requiredStations} stazioni · gap {gap === 0 ? '0' : `+${gap}`}
              </p>
              <p className={`mt-2 text-lg font-bold ${index === 0 ? 'text-zinc-600' : 'text-zinc-400'}`}>
                Ultimo: {latest ? `${latest.station.name} ${formatScore(latest.score.rawScore)} ${latest.station.scoreUnit}` : 'Non disponibile'}
              </p>
            </div>
            <strong className="text-6xl font-black tabular-nums xl:text-center">{row.totalPoints}</strong>
            <StationDots row={row} stations={stations} leader={index === 0} />
          </article>
        );
      })}
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
  if (leaderboards.length === 0) {
    return <EmptyState title="Nessuna categoria selezionata" message="Seleziona una o piu categorie per mostrare la panoramica evento." />;
  }

  return (
    <section className="grid gap-5 xl:grid-cols-2" data-testid="display-multi-mode">
      {leaderboards.map(({ category, rows }) => (
        <article className="rounded-xl border border-white/10 bg-zinc-900 p-5 shadow-2xl" key={category.id}>
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.25em] text-red-300">Categoria</p>
              <h2 className="mt-1 text-4xl font-black">{category.name}</h2>
            </div>
            <span className="rounded-md bg-red-600 px-4 py-3 text-2xl font-black">{category.code}</span>
          </div>
          <div className="mt-4 grid gap-3">
            {rows.length ? (
              rows.slice(0, 5).map((row, index) => (
                <div className="grid grid-cols-[60px_1fr_120px] items-center gap-3 rounded-lg bg-white/5 p-3" key={row.participantId}>
                  <span className="text-4xl font-black text-red-300">#{index + 1}</span>
                  <div className="min-w-0">
                    <h3 className="truncate text-2xl font-black">{row.participantName}</h3>
                    <p className="text-sm font-bold text-zinc-400">
                      {row.completedStations}/{stations.length} stazioni
                    </p>
                  </div>
                  <strong className="text-right text-3xl font-black">{row.totalPoints} pts</strong>
                </div>
              ))
            ) : (
              <p className="rounded-md bg-white/5 p-4 font-bold text-zinc-400">Nessun partecipante in questa categoria.</p>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

function StationsMode({
  categories,
  participants,
  scores,
  stations,
}: {
  categories: Category[];
  participants: Participant[];
  scores: Score[];
  stations: Station[];
}) {
  if (categories.length === 0) {
    return <EmptyState title="Nessuna categoria selezionata" message="Seleziona una categoria per vedere il dettaglio stazioni." />;
  }

  return (
    <section className="grid gap-6" data-testid="display-stations-mode">
      {categories.map((category) => {
        const rows = calculateLeaderboard(scores, participants, stations, category.id, {
          includedScoreStatuses: [...DISPLAY_LEADERBOARD_SCORE_STATUSES],
        });
        const bestByStation = bestScoreByStation(rows, stations);

        return (
          <article className="overflow-x-auto rounded-xl border border-white/10 bg-zinc-900 shadow-2xl" key={category.id}>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.25em] text-red-300">Dettaglio Stazioni</p>
                <h2 className="mt-1 text-3xl font-black">{category.name}</h2>
              </div>
              <span className="rounded-md bg-white px-3 py-2 text-xl font-black text-zinc-950">{category.code}</span>
            </div>

            {rows.length ? (
              <div className="min-w-[1280px]">
                <div className="grid grid-cols-[260px_repeat(8,minmax(120px,1fr))] border-b border-white/10 bg-black/30 text-xs font-black uppercase text-zinc-400">
                  <div className="p-3">Team/Atleta</div>
                  {stations.map((station) => (
                    <div className="p-3" key={station.id}>
                      <span className="block truncate">{station.name}</span>
                      <span className="text-[10px] text-zinc-500">{station.scoreUnit}</span>
                    </div>
                  ))}
                </div>
                {rows.map((row) => (
                  <div className="grid grid-cols-[260px_repeat(8,minmax(120px,1fr))] border-b border-white/5" key={row.participantId}>
                    <div className="truncate p-3 text-xl font-black">{row.participantName}</div>
                    {stations.map((station) => {
                      const result = row.stationResults.find((item) => item.stationId === station.id);
                      const rawScore = result?.rawScore ?? null;
                      const hasScore = rawScore !== null;
                      const isBest = hasScore && bestByStation.get(station.id) === rawScore;

                      return (
                        <div
                          className={`p-3 font-bold ${
                            hasScore
                              ? isBest
                                ? 'bg-lime-300 text-zinc-950'
                                : 'bg-white/10 text-white'
                              : 'bg-black/20 text-zinc-600'
                          }`}
                          key={station.id}
                        >
                          {hasScore ? (
                            <>
                              <span className="block text-xl">
                                {formatScore(rawScore)} {station.scoreUnit}
                              </span>
                              <span className="text-xs opacity-70">rank pts {result?.rankPoints ?? '-'}</span>
                            </>
                          ) : (
                            <span className="text-sm uppercase">missing</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-5 font-bold text-zinc-400">Nessun partecipante in questa categoria.</p>
            )}
          </article>
        );
      })}
    </section>
  );
}

function StationDots({ leader, row, stations }: { leader: boolean; row: LeaderboardRow; stations: Station[] }) {
  return (
    <div className="grid grid-cols-8 gap-2" data-testid={`station-breakdown-${row.participantId}`}>
      {stations.map((station) => {
        const result = row.stationResults.find((item) => item.stationId === station.id);
        const completed = result?.rawScore !== null && result?.rawScore !== undefined;

        return (
          <span
            className={`h-5 rounded-full ${completed ? (leader ? 'bg-red-600' : 'bg-lime-300') : leader ? 'bg-zinc-300' : 'bg-zinc-700'}`}
            key={station.id}
            title={`${station.name}: ${completed ? `${result.rawScore} ${station.scoreUnit}` : 'missing'}`}
          />
        );
      })}
    </div>
  );
}

function EmptyState({ message, title }: { message: string; title: string }) {
  return (
    <section className="rounded-xl border border-white/10 bg-zinc-900 p-8 text-center">
      <h2 className="text-4xl font-black">{title}</h2>
      <p className="mt-3 text-lg font-bold text-zinc-400">{message}</p>
    </section>
  );
}

function latestScoreForParticipant(participantId: string, scores: Score[], stations: Station[]) {
  const stationById = new Map(stations.map((station) => [station.id, station]));
  const participantScores = scores
    .filter((score) => score.participantId === participantId)
    .filter((score) => stationById.has(score.stationId))
    .sort((a, b) => scoreTimestamp(b) - scoreTimestamp(a));
  const score = participantScores[0];
  const station = score ? stationById.get(score.stationId) : null;

  return score && station ? { score, station } : null;
}

function bestScoreByStation(rows: LeaderboardRow[], stations: Station[]): Map<string, number> {
  const best = new Map<string, number>();

  for (const station of stations) {
    const values = rows
      .map((row) => row.stationResults.find((result) => result.stationId === station.id)?.rawScore)
      .filter((value): value is number => value !== null && value !== undefined);

    if (values.length) {
      best.set(station.id, station.higherIsBetter ? Math.max(...values) : Math.min(...values));
    }
  }

  return best;
}

function scoreTimestamp(score: Score): number {
  const parsed = Date.parse(score.updatedAt ?? score.createdAt ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function realtimeLabel(status: RealtimeStatus): string {
  if (status === 'live') return 'Realtime attivo';
  if (status === 'connecting') return 'Realtime connessione';
  if (status === 'error') return 'Polling fallback';
  return 'Realtime disattivato';
}

function realtimeFooter(status: RealtimeStatus): string {
  if (status === 'live') return 'Supabase Realtime attivo su scores.';
  if (status === 'connecting') return 'Connessione a Supabase Realtime in corso.';
  if (status === 'error') return 'Realtime non disponibile: polling automatico attivo ogni 10 secondi.';
  return 'Fallback demo: Realtime non attivo.';
}
