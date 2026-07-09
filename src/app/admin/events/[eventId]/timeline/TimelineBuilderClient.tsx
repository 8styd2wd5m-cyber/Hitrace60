'use client';

import { useMemo, useState } from 'react';
import { saveTimelineAction } from './actions';
import { buildTimelinePdfRows } from '@/lib/pdf.ts';
import {
  HITRACE60_STATION_TRANSITION_SECONDS,
  HITRACE60_TOTAL_STATIONS,
  HITRACE60_WORK_INTERVAL_SECONDS,
  detectTimelineOverlaps,
  formatDuration,
  generateHeatsForCategory,
  getScoreStationArrivalSchedule,
} from '@/lib/timeline.ts';
import type { Category, Participant } from '@/lib/types.ts';

interface TimelineBuilderClientProps {
  eventId: string;
  categories: Category[];
  participants: Participant[];
  routeEventId: string;
  source: 'supabase' | 'demo';
}

export function TimelineBuilderClient({ eventId, categories, participants, routeEventId, source }: TimelineBuilderClientProps) {
  const defaultCategoryIds = categories.slice(0, Math.min(3, categories.length)).map((category) => category.id);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(defaultCategoryIds);
  const [laneCount, setLaneCount] = useState(4);
  const [workIntervalSeconds, setWorkIntervalSeconds] = useState(HITRACE60_WORK_INTERVAL_SECONDS);
  const [stationTransitionSeconds, setStationTransitionSeconds] = useState(HITRACE60_STATION_TRANSITION_SECONDS);
  const [totalStations, setTotalStations] = useState(HITRACE60_TOTAL_STATIONS);
  const [pauseAfterCategoryMinutes, setPauseAfterCategoryMinutes] = useState(10);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [categoryStarts, setCategoryStarts] = useState(() =>
    Object.fromEntries(categories.map((category, index) => [category.id, defaultStartForCategory(index)])),
  );
  const [lastValidCategoryStarts, setLastValidCategoryStarts] = useState(() =>
    Object.fromEntries(categories.map((category, index) => [category.id, safeDateToISOString(defaultStartForCategory(index)) ?? new Date().toISOString()])),
  );

  const selectedCategories = categories.filter((category) => selectedCategoryIds.includes(category.id));
  const invalidStartCategories = selectedCategories.filter((category) => !safeDateToISOString(categoryStarts[category.id]));
  const startIntervalSeconds = workIntervalSeconds + stationTransitionSeconds;
  const courseDurationSeconds = totalStations * workIntervalSeconds + (totalStations - 1) * stationTransitionSeconds;
  const generatedByCategory = useMemo(
    () =>
      selectedCategories.map((category) => ({
        category,
        generated: generateHeatsForCategory({
          eventId,
          categoryId: category.id,
          participants,
          laneCount,
          startsAt: lastValidCategoryStarts[category.id] ?? safeDateToISOString(defaultStartForCategory(0)) ?? new Date().toISOString(),
          workIntervalSeconds,
          stationTransitionSeconds,
          totalStations,
          pauseAfterCategoryMinutes,
        }),
      })),
    [
      eventId,
      laneCount,
      lastValidCategoryStarts,
      participants,
      pauseAfterCategoryMinutes,
      selectedCategories,
      stationTransitionSeconds,
      totalStations,
      workIntervalSeconds,
    ],
  );
  const allHeats = generatedByCategory.flatMap((item) => item.generated.heats);
  const allHeatParticipants = generatedByCategory.flatMap((item) => item.generated.heatParticipants);
  const allTimelineBlocks = generatedByCategory.flatMap((item) => item.generated.timelineBlocks);
  const allStartSlots = generatedByCategory.flatMap((item) => item.generated.startSlots);
  const overlaps = detectTimelineOverlaps(allTimelineBlocks);
  const assignedParticipantIds = new Set(allHeatParticipants.map((lane) => lane.participantId));
  const selectedParticipantIds = new Set(
    participants
      .filter((participant) => selectedCategoryIds.includes(participant.categoryId))
      .filter((participant) => participant.status !== 'withdrawn' && participant.status !== 'dnf')
      .map((participant) => participant.id),
  );
  const unassignedParticipants = participants.filter(
    (participant) => selectedParticipantIds.has(participant.id) && !assignedParticipantIds.has(participant.id),
  );
  const pdfRows = buildTimelinePdfRows({
    categories,
    heats: allHeats,
    heatParticipants: allHeatParticipants,
    participants,
    startIntervalSeconds,
    courseDurationSeconds,
  });
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));

  function toggleCategory(categoryId: string) {
    setSelectedCategoryIds((currentIds) =>
      currentIds.includes(categoryId) ? currentIds.filter((id) => id !== categoryId) : [...currentIds, categoryId],
    );
  }

  async function saveTimeline() {
    setSaveMessage(null);
    setIsSaving(true);

    try {
      const result = await saveTimelineAction({
        eventId,
        routeEventId,
        selectedCategoryIds,
        categoryStarts: Object.fromEntries(
          selectedCategories.map((category) => [
            category.id,
            lastValidCategoryStarts[category.id] ?? safeDateToISOString(defaultStartForCategory(0)) ?? new Date().toISOString(),
          ]),
        ),
        laneCount,
        workIntervalSeconds,
        stationTransitionSeconds,
        totalStations,
        pauseAfterCategoryMinutes,
      });

      setSaveMessage(
        result.ok && result.counts
          ? `${result.message} Heat ${result.counts.heats}, lane ${result.counts.heatParticipants}, scorecard ${result.counts.scorecards}.`
          : result.message,
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <form className="rounded-lg bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Generatore start slot</h2>
        <p
          className={`mt-3 inline-flex rounded-md px-3 py-2 text-xs font-black uppercase ${
            source === 'supabase' ? 'bg-lime-100 text-lime-900' : 'bg-amber-100 text-amber-900'
          }`}
        >
          {source === 'supabase' ? 'DB reale' : 'Fallback demo'}
        </p>

        <fieldset className="mt-5 grid gap-2">
          <legend className="text-sm font-bold">Categorie</legend>
          {categories.map((category) => (
            <label className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2" key={category.id}>
              <span className="font-bold">{category.name}</span>
              <input
                checked={selectedCategoryIds.includes(category.id)}
                className="h-5 w-5"
                onChange={() => toggleCategory(category.id)}
                type="checkbox"
              />
            </label>
          ))}
        </fieldset>

        <NumberField label="Lane contemporanee" min={1} onChange={setLaneCount} value={laneCount} />
        <NumberField label="Work interval secondi" min={1} onChange={setWorkIntervalSeconds} value={workIntervalSeconds} />
        <NumberField label="Transition/rest secondi" min={0} onChange={setStationTransitionSeconds} value={stationTransitionSeconds} />
        <NumberField label="Stazioni totali" min={1} onChange={setTotalStations} value={totalStations} />
        <NumberField label="Pausa dopo categoria minuti" min={0} onChange={setPauseAfterCategoryMinutes} value={pauseAfterCategoryMinutes} />

        <div className="mt-5 rounded-md bg-zinc-100 p-4">
          <p className="text-sm font-black uppercase text-zinc-500">Parametri calcolati</p>
          <dl className="mt-3 grid gap-2 text-sm">
            <InfoLine label="Start interval" value={formatDuration(startIntervalSeconds)} />
            <InfoLine label="Durata percorso team" value={formatDuration(courseDurationSeconds)} />
          </dl>
        </div>

        <div className="mt-5 grid gap-3">
          <h3 className="text-sm font-black uppercase text-zinc-500">Start categoria</h3>
          {selectedCategories.map((category) => (
            <label className="block text-sm font-bold" key={category.id}>
              {category.name}
              <input
                className={`mt-2 w-full rounded-md border px-3 py-3 ${
                  safeDateToISOString(categoryStarts[category.id]) ? 'border-zinc-300' : 'border-amber-400 bg-amber-50'
                }`}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  const nextIso = safeDateToISOString(nextValue);

                  setCategoryStarts((currentStarts) => ({
                    ...currentStarts,
                    [category.id]: nextValue,
                  }));

                  if (nextIso) {
                    setLastValidCategoryStarts((currentStarts) => ({
                      ...currentStarts,
                      [category.id]: nextIso,
                    }));
                  }
                }}
                type="datetime-local"
                value={categoryStarts[category.id] ?? defaultStartForCategory(0)}
              />
              {!safeDateToISOString(categoryStarts[category.id]) ? (
                <span className="mt-1 block rounded-md bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">
                  Data non completa: la preview usa l&apos;ultimo orario valido.
                </span>
              ) : null}
            </label>
          ))}
        </div>
      </form>

      <section className="rounded-lg bg-white p-5 shadow-sm" data-testid="timeline-builder">
        <div className="flex flex-col justify-between gap-3 border-b border-zinc-200 pb-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-black">Timeline generata</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {allStartSlots.length} start slot · {allHeatParticipants.length} partecipanti assegnati · {selectedCategories.length}{' '}
              categorie
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-md bg-zinc-950 px-4 py-3 font-black text-white"
              data-testid="timeline-export-pdf"
              onClick={() => window.print()}
              type="button"
            >
              Esporta PDF
            </button>
            <button
              className="rounded-md bg-lime-300 px-4 py-3 font-black text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
              data-testid="timeline-save-db"
              disabled={source !== 'supabase' || isSaving}
              onClick={saveTimeline}
              type="button"
            >
              {isSaving ? 'Salvataggio...' : 'Salva su DB reale'}
            </button>
          </div>
        </div>

        {saveMessage ? (
          <div
            className={`mt-4 rounded-md p-4 font-bold ${
              saveMessage.includes('salvata') ? 'bg-lime-100 text-lime-900' : 'bg-amber-100 text-amber-900'
            }`}
          >
            {saveMessage}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SummaryCard label="Start slot totali" value={allStartSlots.length} />
          <SummaryCard label="Partecipanti assegnati" value={allHeatParticipants.length} />
          <SummaryCard label="Non assegnati" tone={unassignedParticipants.length ? 'warn' : 'ok'} value={unassignedParticipants.length} />
        </div>

        {invalidStartCategories.length ? (
          <div className="mt-4 rounded-md bg-amber-100 p-4 font-bold text-amber-900">
            {invalidStartCategories.length} start categoria incompleti: salvataggio e preview usano l&apos;ultimo valore valido.
          </div>
        ) : null}

        {overlaps.length ? (
          <div className="mt-4 rounded-md bg-amber-100 p-4 text-amber-900" data-testid="timeline-overlap-warning">
            <strong>{overlaps.length} occupazioni categoria sovrapposte.</strong> Informazione non bloccante: HITRACE60 usa partenze
            scaglionate ogni 4:10. Il conflitto reale su stazione/lane verra gestito con un controllo dedicato.
          </div>
        ) : (
          <div className="mt-4 rounded-md bg-lime-100 p-4 font-bold text-lime-900">Nessuna occupazione categoria sovrapposta.</div>
        )}

        {unassignedParticipants.length ? (
          <div className="mt-4 rounded-md bg-amber-100 p-4 text-amber-900" data-testid="timeline-unassigned-warning">
            <strong>Partecipanti non assegnati:</strong> {unassignedParticipants.map((participant) => participant.displayName).join(', ')}
          </div>
        ) : null}

        <div className="mt-6 grid gap-5">
          {generatedByCategory.map(({ category, generated }) => {
            const summary = generated.summary;

            return (
              <section className="rounded-md border border-zinc-200 p-4" key={category.id}>
                <div className="flex flex-col justify-between gap-2 border-b border-zinc-100 pb-3 md:flex-row md:items-center">
                  <div>
                    <h3 className="text-2xl font-black">{category.name}</h3>
                    {summary ? (
                      <p className="text-sm font-semibold text-zinc-500">
                        Start categoria: {formatTime(summary.startsAt)} · Fine stimata: {formatTime(summary.lastFinishAt)}
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-zinc-500">Nessun partecipante assegnato</p>
                    )}
                  </div>
                  <span className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-black">{category.code}</span>
                </div>

                {summary ? (
                  <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                    <Metric label="Partecipanti" value={summary.participantCount} />
                    <Metric label="Lane" value={summary.laneCount} />
                    <Metric label="Start slot" value={`ogni ${formatDuration(summary.startIntervalSeconds)}`} />
                    <Metric label="Durata percorso team" value={formatDuration(summary.courseDurationSeconds)} />
                    <Metric label="Ultimo start" value={formatTime(summary.lastStartAt)} />
                    <Metric label="Occupazione con pausa" value={formatTime(summary.endsAt)} />
                  </dl>
                ) : null}

                <div className="mt-4 grid gap-3">
                  {generated.startSlots.map((slot) => (
                    <article className="rounded-md bg-zinc-50 p-4" key={slot.id}>
                      <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
                        <div>
                          <h4 className="text-xl font-black">Slot {slot.slotNumber}</h4>
                          <p className="text-sm font-semibold text-zinc-500">
                            {formatTime(slot.startsAt)} · finish stimato {formatTime(slot.estimatedFinishAt)}
                          </p>
                        </div>
                        <strong className="text-lg">
                          {slot.lanes.length}/{laneCount} lane
                        </strong>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {slot.lanes.map((lane) => (
                          <div className="rounded-md bg-white px-3 py-2 text-sm font-bold" key={`${slot.id}-${lane.laneNumber}`}>
                            <p>
                              {lane.laneLabel}: {participantById.get(lane.participantId)?.displayName ?? lane.participantId}
                              <span className="ml-2 font-semibold text-zinc-500">
                                start {formatTime(lane.startsAt)} · finish {formatTime(lane.estimatedFinishAt)}
                              </span>
                            </p>
                            <details className="mt-2 text-xs text-zinc-600">
                              <summary className="cursor-pointer font-black text-zinc-900">Arrivi stazioni score</summary>
                              <div className="mt-2 grid gap-1 md:grid-cols-2">
                                {getScoreStationArrivalSchedule(lane.startsAt).map((arrival) => (
                                  <span key={`${lane.participantId}-${arrival.stationSlug}`}>
                                    {arrival.stationName}: {formatTime(arrival.arrivalAt)}
                                  </span>
                                ))}
                              </div>
                            </details>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <section className="print-area hidden bg-white p-6 text-zinc-950">
        <h1 className="text-3xl font-black">HITRACE60 Demo Event - Timeline Gara</h1>
        <p className="mt-1 text-sm">
          Start interval {formatDuration(startIntervalSeconds)} · Durata percorso team {formatDuration(courseDurationSeconds)}
        </p>
        <div className="mt-6 grid gap-6">
          {selectedCategories.map((category) => {
            const rows = pdfRows.filter((row) => row.categoryName === category.name);
            const generated = generatedByCategory.find((item) => item.category.id === category.id)?.generated;

            return (
              <section key={category.id}>
                <h2 className="text-2xl font-black">{category.name}</h2>
                {generated?.summary ? (
                  <p className="mt-1 text-sm font-bold">
                    Start {formatTime(generated.summary.startsAt)} · End stimato {formatTime(generated.summary.lastFinishAt)} · Percorso{' '}
                    {formatDuration(generated.summary.courseDurationSeconds)}
                  </p>
                ) : null}
                <table className="mt-2 w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <PrintTh>Slot</PrintTh>
                      <PrintTh>Lane</PrintTh>
                      <PrintTh>Team/Atleta</PrintTh>
                      <PrintTh>Start</PrintTh>
                      <PrintTh>Finish stimato</PrintTh>
                      <PrintTh>Note</PrintTh>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={`${category.id}-${index}`}>
                        <PrintTd>{row.slotNumber}</PrintTd>
                        <PrintTd>{row.laneLabel}</PrintTd>
                        <PrintTd>{row.participantName}</PrintTd>
                        <PrintTd>{formatTime(row.startsAt)}</PrintTd>
                        <PrintTd>{formatTime(row.estimatedFinishAt)}</PrintTd>
                        <PrintTd>{row.notes}</PrintTd>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function NumberField({
  label,
  min,
  onChange,
  value,
}: {
  label: string;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="mt-4 block text-sm font-bold">
      {label}
      <input
        className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-600">{label}</dt>
      <dd className="font-black">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-zinc-100 p-3">
      <dt className="font-bold text-zinc-500">{label}</dt>
      <dd className="mt-1 text-lg font-black">{value}</dd>
    </div>
  );
}

function SummaryCard({ label, tone = 'neutral', value }: { label: string; tone?: 'neutral' | 'ok' | 'warn'; value: number }) {
  return (
    <div className={`rounded-md p-4 ${tone === 'warn' ? 'bg-amber-100' : tone === 'ok' ? 'bg-lime-100' : 'bg-zinc-100'}`}>
      <p className="text-sm font-bold text-zinc-500">{label}</p>
      <strong className="mt-1 block text-3xl font-black">{value}</strong>
    </div>
  );
}

function PrintTh({ children }: { children: React.ReactNode }) {
  return <th className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-left">{children}</th>;
}

function PrintTd({ children }: { children: React.ReactNode }) {
  return <td className="border border-zinc-300 px-2 py-1">{children}</td>;
}

function defaultStartForCategory(index: number): string {
  const start = new Date('2026-07-07T08:00:00.000Z');
  start.setMinutes(start.getMinutes() + index * 90);
  return toDateTimeLocalValue(start);
}

function toDateTimeLocalValue(date: Date): string {
  return date.toISOString().slice(0, 16);
}

function safeDateToISOString(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return null;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function formatTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return '--:--:--';

  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(new Date(value));
}
