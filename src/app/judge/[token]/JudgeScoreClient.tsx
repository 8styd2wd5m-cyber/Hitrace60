'use client';

import { useEffect, useMemo, useState } from 'react';
import { reopenJudgeScoreAction, validateJudgeScoreAction } from './actions';
import { canJudgeSubmitScore } from '@/lib/judge-permissions.ts';
import type { JudgeScorecardRow, JudgeStationScorecards, Score } from '@/lib/types.ts';

interface JudgeScoreClientProps {
  stationScorecards: JudgeStationScorecards[];
  currentHeatId?: string | null;
  judgeToken: string;
  source: 'supabase' | 'demo';
  showDataSourceBadge?: boolean;
}

type SaveStatus = 'online' | 'saving' | 'saved' | 'error' | 'offline';

interface PendingCorrection {
  previousScore: number;
  reason: string;
  judgeName: string;
  openedAt: string;
}

interface AuditLogEntry extends PendingCorrection {
  id: string;
  participantName: string;
  stationName: string;
  newScore: number;
  savedAt: string;
}

export function JudgeScoreClient({
  stationScorecards,
  currentHeatId = null,
  judgeToken,
  source,
  showDataSourceBadge = false,
}: JudgeScoreClientProps) {
  const firstStationId = stationScorecards[0]?.station.id ?? '';
  const firstStationRows = stationScorecards[0]?.scorecards ?? [];
  const defaultHeatId = getDefaultHeatId(firstStationRows, currentHeatId);
  const [selectedStationId, setSelectedStationId] = useState(firstStationId);
  const [scorecardsByStation, setScorecardsByStation] = useState(() =>
    Object.fromEntries(stationScorecards.map((item) => [item.station.id, item.scorecards])),
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [selectedHeatId, setSelectedHeatId] = useState(defaultHeatId);
  const [selectedScorecardId, setSelectedScorecardId] = useState<string | null>(() => {
    const visibleRows = filterScorecards(firstStationRows, 'all', defaultHeatId);
    return findFirstOpenScorecard(visibleRows)?.id ?? visibleRows[0]?.id ?? null;
  });
  const [message, setMessage] = useState('Pronto per inserire score');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('online');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [correctionTargetId, setCorrectionTargetId] = useState<string | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const [correctionError, setCorrectionError] = useState('');
  const [pendingCorrections, setPendingCorrections] = useState<Record<string, PendingCorrection>>({});
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const selectedConfig = useMemo(
    () => stationScorecards.find((item) => item.station.id === selectedStationId) ?? stationScorecards[0],
    [selectedStationId, stationScorecards],
  );
  const selectedStation = selectedConfig.station;
  const selectedAssignment = selectedConfig.assignment;
  const selectedRows = useMemo(
    () => scorecardsByStation[selectedStation.id] ?? [],
    [scorecardsByStation, selectedStation.id],
  );
  const categoryOptions = useMemo(() => buildCategoryOptions(selectedRows), [selectedRows]);
  const heatOptions = useMemo(() => buildHeatOptions(selectedRows, selectedCategoryId), [selectedRows, selectedCategoryId]);
  const visibleScorecards = useMemo(
    () => filterScorecards(selectedRows, selectedCategoryId, selectedHeatId),
    [selectedCategoryId, selectedHeatId, selectedRows],
  );
  const selectedScorecard =
    visibleScorecards.find((scorecard) => scorecard.id === selectedScorecardId) ??
    findFirstOpenScorecard(visibleScorecards) ??
    visibleScorecards[0] ??
    null;
  const selectedIsEditable = Boolean(selectedScorecard && !isFinalScoreStatus(selectedScorecard.scoreStatus));
  const completedCount = visibleScorecards.filter((scorecard) => isFinalScoreStatus(scorecard.scoreStatus)).length;
  const allCompleted = visibleScorecards.length > 0 && completedCount === visibleScorecards.length;
  const stationSwitchEnabled = stationScorecards.length > 1;

  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setIsOnline(window.navigator.onLine);

    function handleOnline() {
      setIsOnline(true);
      setSaveStatus('online');
    }

    function handleOffline() {
      setIsOnline(false);
      setSaveStatus('offline');
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  function updateSelectedScore(delta: number) {
    if (!selectedScorecard || !selectedIsEditable || isSubmitting) return;

    updateRowsForSelectedStation((rows) =>
      rows.map((scorecard) =>
        scorecard.id === selectedScorecard.id
          ? {
              ...scorecard,
              rawScore: Math.max(0, scorecard.rawScore + delta),
              scoreStatus: scorecard.scoreStatus === 'missing' ? 'draft' : scorecard.scoreStatus,
            }
          : scorecard,
      ),
    );
    setSaveStatus(isOnline ? 'online' : 'offline');
    setMessage('Bozza locale aggiornata');
  }

  async function validateSelectedScore() {
    if (isSubmitting) return;

    if (!selectedScorecard) {
      setMessage('Nessuna scorecard disponibile');
      return;
    }

    if (!selectedIsEditable) {
      setMessage('Score gia validato. Usa Correggi per riaprirlo.');
      return;
    }

    if (selectedScorecard.rawScore === 0 && !window.confirm('Confermi score 0?')) {
      setMessage('Validazione annullata');
      return;
    }

    const existingScore: Score | null =
      selectedScorecard.scoreStatus === 'missing'
        ? null
        : {
            eventId: selectedScorecard.eventId,
            categoryId: selectedScorecard.categoryId,
            participantId: selectedScorecard.participantId,
            stationId: selectedScorecard.stationId,
            heatId: selectedScorecard.heatId,
            judgeId: selectedAssignment.judgeId,
            judgeAssignmentId: selectedAssignment.id,
            laneNumber: selectedScorecard.laneNumber,
            rawScore: selectedScorecard.rawScore,
            status: selectedScorecard.scoreStatus,
          };

    const permission = canJudgeSubmitScore({
      assignment: selectedAssignment,
      existingScore,
      submission: {
        eventId: selectedAssignment.eventId,
        stationId: selectedStation.id,
        participantId: selectedScorecard.participantId,
        heatId: selectedScorecard.heatId,
        rawScore: selectedScorecard.rawScore,
      },
    });

    if (!permission.allowed) {
      setSaveStatus('error');
      setMessage(`Score non validato: ${permission.reason}`);
      return;
    }

    setIsSubmitting(true);
    setSaveStatus('saving');

    const pendingCorrection = pendingCorrections[selectedScorecard.id];

    if (source === 'supabase') {
      const result = await validateJudgeScoreAction({
        token: judgeToken,
        eventId: selectedScorecard.eventId,
        categoryId: selectedScorecard.categoryId,
        participantId: selectedScorecard.participantId,
        stationId: selectedScorecard.stationId,
        heatId: selectedScorecard.heatId,
        judgeId: selectedAssignment.judgeId,
        judgeAssignmentId: selectedAssignment.id,
        laneNumber: selectedScorecard.laneNumber,
        rawScore: selectedScorecard.rawScore,
        previousScore: pendingCorrection?.previousScore ?? null,
        correctionReason: pendingCorrection?.reason ?? null,
      });

      if (!result.ok) {
        setSaveStatus('error');
        setMessage(`Score non validato: ${result.message ?? 'errore salvataggio'}`);
        setIsSubmitting(false);
        return;
      }

      finalizeValidation(selectedScorecard, pendingCorrection, result.scoreId ?? selectedScorecard.scoreId ?? null, result.status ?? 'validated');
      return;
    }

    window.setTimeout(() => {
      finalizeValidation(
        selectedScorecard,
        pendingCorrection,
        selectedScorecard.scoreId ?? null,
        pendingCorrection ? 'corrected' : 'validated',
      );
    }, 150);
  }

  function finalizeValidation(
    validatedScorecard: JudgeScorecardRow,
    pendingCorrection: PendingCorrection | undefined,
    scoreId: string | null,
    status: Score['status'],
  ) {
    let nextSelection: string | null = null;

    updateRowsForSelectedStation((rows) => {
      const updatedRows = rows.map((scorecard) =>
        scorecard.id === validatedScorecard.id
          ? {
              ...scorecard,
              scoreId,
              scoreStatus: status ?? 'validated',
            }
          : scorecard,
      );
      const updatedVisibleRows = filterScorecards(updatedRows, selectedCategoryId, selectedHeatId);
      nextSelection = findFirstOpenScorecard(updatedVisibleRows)?.id ?? updatedVisibleRows[0]?.id ?? null;
      return updatedRows;
    });

    if (pendingCorrection) {
      setAuditLogs((currentLogs) => [
        ...currentLogs,
        {
          ...pendingCorrection,
          id: `audit-${validatedScorecard.id}-${Date.now()}`,
          participantName: validatedScorecard.participantName,
          stationName: selectedStation.name,
          newScore: validatedScorecard.rawScore,
          savedAt: new Date().toISOString(),
        },
      ]);
      setPendingCorrections((currentCorrections) => {
        const remainingCorrections = { ...currentCorrections };
        delete remainingCorrections[validatedScorecard.id];
        return remainingCorrections;
      });
    }

    setSelectedScorecardId(nextSelection);
    setSaveStatus('saved');
    setMessage('Score validato');
    setIsSubmitting(false);
  }

  function goBack() {
    if (visibleScorecards.length === 0) return;

    const currentIndex = selectedScorecard
      ? visibleScorecards.findIndex((scorecard) => scorecard.id === selectedScorecard.id)
      : 0;
    const previousIndex = Math.max(0, currentIndex - 1);
    setSelectedScorecardId(visibleScorecards[previousIndex]?.id ?? null);
    setMessage('Scorecard precedente selezionata');
  }

  function openLastCorrection() {
    const currentIndex = selectedScorecard
      ? visibleScorecards.findIndex((scorecard) => scorecard.id === selectedScorecard.id)
      : visibleScorecards.length;
    const candidate =
      [...visibleScorecards.slice(0, Math.max(0, currentIndex))].reverse().find((scorecard) => isFinalScoreStatus(scorecard.scoreStatus)) ??
      [...visibleScorecards].reverse().find((scorecard) => isFinalScoreStatus(scorecard.scoreStatus));

    if (!candidate) {
      setMessage('Nessuno score validato da correggere');
      return;
    }

    openCorrection(candidate.id);
  }

  function openCorrection(scorecardId: string) {
    setCorrectionTargetId(scorecardId);
    setCorrectionNote('');
    setCorrectionError('');
    setSelectedScorecardId(scorecardId);
  }

  async function confirmCorrection() {
    const target = visibleScorecards.find((scorecard) => scorecard.id === correctionTargetId);
    const reason = correctionNote.trim();

    if (!target) {
      setCorrectionError('Scorecard non trovata');
      return;
    }

    if (!reason) {
      setCorrectionError('Inserisci una nota di correzione obbligatoria');
      return;
    }

    setSaveStatus('saving');
    setIsSubmitting(true);

    if (source === 'supabase') {
      const result = await reopenJudgeScoreAction({
        token: judgeToken,
        eventId: target.eventId,
        participantId: target.participantId,
        stationId: target.stationId,
        heatId: target.heatId,
        judgeAssignmentId: target.judgeAssignmentId,
        reason,
      });

      if (!result.ok) {
        setCorrectionError(result.message ?? 'Correzione non salvata');
        setSaveStatus('error');
        setIsSubmitting(false);
        return;
      }
    }

    setPendingCorrections((currentCorrections) => ({
      ...currentCorrections,
      [target.id]: {
        previousScore: target.rawScore,
        reason,
        judgeName: selectedAssignment.judgeName ?? selectedAssignment.judgeId,
        openedAt: new Date().toISOString(),
      },
    }));
    updateRowsForSelectedStation((rows) =>
      rows.map((scorecard) => (scorecard.id === target.id ? { ...scorecard, scoreStatus: 'draft' as const } : scorecard)),
    );
    setCorrectionTargetId(null);
    setCorrectionNote('');
    setCorrectionError('');
    setSelectedScorecardId(target.id);
    setSaveStatus('saved');
    setIsSubmitting(false);
    setMessage('Score riaperto per correzione');
  }

  function updateRowsForSelectedStation(updater: (rows: JudgeScorecardRow[]) => JudgeScorecardRow[]) {
    setScorecardsByStation((currentRowsByStation) => ({
      ...currentRowsByStation,
      [selectedStation.id]: updater(currentRowsByStation[selectedStation.id] ?? []),
    }));
  }

  function selectStation(stationId: string) {
    const rows = scorecardsByStation[stationId] ?? [];
    const nextHeatId = getDefaultHeatId(rows, currentHeatId);
    const nextVisibleScorecards = filterScorecards(rows, 'all', nextHeatId);
    setSelectedStationId(stationId);
    setSelectedCategoryId('all');
    setSelectedHeatId(nextHeatId);
    setSelectedScorecardId(findFirstOpenScorecard(nextVisibleScorecards)?.id ?? nextVisibleScorecards[0]?.id ?? null);
    setCorrectionTargetId(null);
    setCorrectionNote('');
    setCorrectionError('');
  }

  function selectCategory(categoryId: string) {
    const heatStillAvailable =
      selectedHeatId === 'all' ||
      selectedRows.some((scorecard) => scorecard.heatId === selectedHeatId && (categoryId === 'all' || scorecard.categoryId === categoryId));
    const nextHeatId = heatStillAvailable ? selectedHeatId : 'all';
    const nextVisibleScorecards = filterScorecards(selectedRows, categoryId, nextHeatId);
    setSelectedCategoryId(categoryId);
    setSelectedHeatId(nextHeatId);
    setSelectedScorecardId(findFirstOpenScorecard(nextVisibleScorecards)?.id ?? nextVisibleScorecards[0]?.id ?? null);
    setCorrectionTargetId(null);
    setCorrectionNote('');
    setCorrectionError('');
  }

  function selectHeat(heatId: string) {
    const nextVisibleScorecards = filterScorecards(selectedRows, selectedCategoryId, heatId);
    setSelectedHeatId(heatId);
    setSelectedScorecardId(findFirstOpenScorecard(nextVisibleScorecards)?.id ?? nextVisibleScorecards[0]?.id ?? null);
    setCorrectionTargetId(null);
    setCorrectionNote('');
    setCorrectionError('');
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-950 pb-8 text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-300">Stazione</p>
                {showDataSourceBadge ? (
                  <span
                    className={`rounded px-2 py-1 text-[11px] font-black uppercase ${
                      source === 'supabase' ? 'bg-sky-300 text-zinc-950' : 'bg-amber-300 text-zinc-950'
                    }`}
                    data-testid="judge-data-source"
                  >
                    {source === 'supabase' ? 'DB reale' : 'Fallback demo'}
                  </span>
                ) : null}
              </div>
              <h1 className="truncate text-3xl font-black" data-testid="judge-station-name">
                {selectedStation.name}
              </h1>
              <p className="mt-1 text-sm font-semibold text-zinc-300">
                {selectedAssignment.judgeName ?? selectedAssignment.judgeId}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-bold uppercase text-zinc-400">Ora</p>
              {!mounted || !now ? (
                <time className="text-xl font-black tabular-nums" dateTime="" data-testid="judge-clock">
                  --:--:--
                </time>
              ) : (
                <time className="text-xl font-black tabular-nums" dateTime={now.toISOString()} data-testid="judge-clock">
                  {now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </time>
              )}
            </div>
          </div>

          {stationSwitchEnabled ? (
            <label className="grid gap-2 text-sm font-bold text-zinc-200">
              Scegli stazione
              <select
                className="h-12 rounded-md border border-white/15 bg-white px-3 text-base font-black text-zinc-950"
                data-testid="station-switch"
                onChange={(event) => selectStation(event.target.value)}
                value={selectedStation.id}
              >
                {stationScorecards.map((item) => (
                  <option key={item.station.id} value={item.station.id}>
                    {item.station.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs font-black uppercase text-zinc-400">
              Categoria
              <select
                className="h-12 rounded-md border border-white/15 bg-white px-3 text-sm font-black normal-case text-zinc-950"
                data-testid="judge-category-select"
                onChange={(event) => selectCategory(event.target.value)}
                value={selectedCategoryId}
              >
                <option value="all">Tutte le categorie</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-black uppercase text-zinc-400">
              Heat
              <select
                className="h-12 rounded-md border border-white/15 bg-white px-3 text-sm font-black normal-case text-zinc-950"
                data-testid="judge-heat-select"
                onChange={(event) => selectHeat(event.target.value)}
                value={selectedHeatId}
              >
                <option value="all">Tutte le heat</option>
                {heatOptions.map((heat) => (
                  <option key={heat.id} value={heat.id}>
                    Heat {heat.number}
                    {heat.id === currentHeatId ? ' · corrente' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm font-bold text-zinc-300" data-testid="judge-save-status">
              {formatSaveStatus(saveStatus)}
            </p>
            <p className="text-sm font-bold text-zinc-300" data-testid="judge-progress">
              {completedCount}/{visibleScorecards.length} validati
            </p>
          </div>

          {!isOnline ? (
            <p className="rounded-md bg-red-500 px-3 py-2 text-sm font-black text-white" data-testid="offline-warning">
              Offline: le bozze restano locali finche la connessione torna disponibile.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              className="h-14 rounded-md bg-zinc-800 text-base font-black text-white active:scale-[0.99] disabled:bg-zinc-900 disabled:text-zinc-600"
              data-testid="back-score-button"
              disabled={visibleScorecards.length === 0 || isSubmitting}
              onClick={goBack}
              type="button"
            >
              Indietro
            </button>
            <button
              className="h-14 rounded-md bg-white text-base font-black text-zinc-950 active:scale-[0.99] disabled:bg-zinc-800 disabled:text-zinc-600"
              data-testid="correct-last-button"
              disabled={!visibleScorecards.some((scorecard) => isFinalScoreStatus(scorecard.scoreStatus)) || isSubmitting}
              onClick={openLastCorrection}
              type="button"
            >
              Correggi ultimo
            </button>
          </div>

          <button
            className="h-16 rounded-md bg-lime-300 text-xl font-black text-zinc-950 shadow-lg shadow-lime-300/10 active:scale-[0.99] disabled:bg-zinc-700 disabled:text-zinc-400"
            data-testid="validate-score-button"
            disabled={!selectedScorecard || !selectedIsEditable || isSubmitting}
            onClick={validateSelectedScore}
            type="button"
          >
            {isSubmitting ? 'SALVATAGGIO...' : 'VALIDA SCORE'}
          </button>
        </div>
      </header>

      <main className="mx-auto flex min-w-0 max-w-3xl flex-col gap-4 overflow-x-hidden px-4 pt-4">
        <p aria-live="polite" className="rounded-md bg-white/10 px-4 py-3 text-lg font-bold" data-testid="judge-message">
          {allCompleted ? 'Tutti gli score di questa stazione sono stati validati' : message}
        </p>

        {correctionTargetId ? (
          <section className="rounded-lg border border-amber-300 bg-amber-100 p-4 text-zinc-950" data-testid="correction-panel">
            <h2 className="text-xl font-black">Conferma correzione</h2>
            <p className="mt-1 text-sm font-semibold text-zinc-700">Inserisci il motivo prima di riaprire lo score.</p>
            <textarea
              className="mt-3 min-h-24 w-full rounded-md border border-zinc-300 p-3 text-base"
              data-testid="correction-note"
              onChange={(event) => setCorrectionNote(event.target.value)}
              placeholder="Motivo correzione"
              value={correctionNote}
            />
            {correctionError ? <p className="mt-2 text-sm font-black text-red-700">{correctionError}</p> : null}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="h-12 rounded-md bg-zinc-200 font-black text-zinc-950"
                onClick={() => setCorrectionTargetId(null)}
                type="button"
              >
                Annulla
              </button>
              <button
                className="h-12 rounded-md bg-zinc-950 font-black text-white"
                data-testid="confirm-correction-button"
                onClick={confirmCorrection}
                type="button"
              >
                Riapri score
              </button>
            </div>
          </section>
        ) : null}

        {allCompleted ? (
          <section className="rounded-lg bg-white p-4 text-zinc-950" data-testid="judge-summary">
            <h2 className="text-2xl font-black">Riepilogo finale stazione</h2>
            <div className="mt-4 grid gap-3">
              {visibleScorecards.map((scorecard) => (
                <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-3" key={scorecard.id}>
                  <span className="font-bold">{scorecard.participantName}</span>
                  <span className="text-lg font-black">
                    {scorecard.rawScore} {scorecard.scoreUnit}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid min-w-0 gap-0" data-testid="judge-scorecard-list">
          {visibleScorecards.map((scorecard) => {
            const isSelected = selectedScorecard?.id === scorecard.id;
            const isEditable = isSelected && !isFinalScoreStatus(scorecard.scoreStatus);
            const statusLabel = getScorecardStatusLabel(scorecard, isSelected);

            return (
              <article
                className={`w-full min-w-0 border-b border-white/15 py-5 ${
                  isSelected ? 'text-white' : isFinalScoreStatus(scorecard.scoreStatus) ? 'text-lime-100' : 'text-zinc-500'
                }`}
                data-testid={`judge-scorecard-${scorecard.participantId}`}
                key={scorecard.id}
              >
                <button
                  className="w-full min-w-0 text-left"
                  onClick={() => setSelectedScorecardId(scorecard.id)}
                  type="button"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span
                        className={`mb-2 inline-flex rounded px-2 py-1 text-xs font-black uppercase ${
                          statusLabel === 'Attivo'
                            ? 'bg-lime-300 text-zinc-950'
                            : statusLabel === 'Validato'
                              ? 'bg-white text-zinc-950'
                              : statusLabel === 'Corretto'
                                ? 'bg-amber-300 text-zinc-950'
                                : 'bg-zinc-800 text-zinc-300'
                        }`}
                        data-testid={`status-badge-${scorecard.participantId}`}
                      >
                        {statusLabel}
                      </span>
                      <h2 className="truncate text-2xl font-black">{scorecard.participantName}</h2>
                      <p className="mt-1 text-xs font-black uppercase text-lime-300">
                        {scorecard.categoryName ?? scorecard.categoryId} · Heat {scorecard.heatNumber}
                      </p>
                      <p className="mt-1 text-sm font-bold">
                        arrivo previsto {formatHeatTime(scorecard.stationArrivalAt)}
                        {scorecard.laneLabel ? ` · ${scorecard.laneLabel}` : ''}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-zinc-400">
                        start gara {formatHeatTime(scorecard.teamStartAt)} · station {scorecard.raceStationOrder}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <strong className="text-4xl font-black tabular-nums" data-testid={`score-${scorecard.participantId}`}>
                        {scorecard.rawScore}
                      </strong>
                      <span className="ml-1 text-sm font-black">{scorecard.scoreUnit}</span>
                    </div>
                  </div>
                </button>

                {isEditable ? (
                <div className="mt-4 grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
                    {[-1, 1, 5, 10].map((delta) => (
                      <button
                        className={`h-16 w-full touch-manipulation rounded-md text-2xl font-black active:scale-[0.99] ${
                          delta < 0 ? 'bg-white text-zinc-950' : 'bg-lime-300 text-zinc-950'
                        } disabled:bg-zinc-800 disabled:text-zinc-500`}
                        data-testid={`score-button-${scorecard.participantId}-${delta}`}
                        disabled={(delta < 0 && scorecard.rawScore === 0) || isSubmitting}
                        key={delta}
                        onClick={() => updateSelectedScore(delta)}
                        type="button"
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-3">
                    <p className="text-sm font-bold" data-testid={`scorecard-status-${scorecard.participantId}`}>
                      {scorecard.scoreStatus === 'validated'
                        ? `validato: ${scorecard.rawScore} ${scorecard.scoreUnit}`
                        : scorecard.scoreStatus === 'corrected'
                          ? `corretto: ${scorecard.rawScore} ${scorecard.scoreUnit}`
                          : 'in attesa'}
                    </p>
                    {isFinalScoreStatus(scorecard.scoreStatus) && isSelected ? (
                      <button
                        className="h-12 rounded-md bg-amber-300 font-black text-zinc-950"
                        data-testid={`correct-score-${scorecard.participantId}`}
                        onClick={() => openCorrection(scorecard.id)}
                        type="button"
                      >
                        Correggi
                      </button>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <p className="text-xs font-semibold text-zinc-500" data-testid="audit-log-count">
          Audit log locali: {auditLogs.length}
        </p>
      </main>
    </div>
  );
}

function filterScorecards(rows: JudgeScorecardRow[], categoryId: string, heatId: string): JudgeScorecardRow[] {
  return rows.filter((scorecard) => {
    const categoryMatches = categoryId === 'all' || scorecard.categoryId === categoryId;
    const heatMatches = heatId === 'all' || scorecard.heatId === heatId;

    return categoryMatches && heatMatches;
  });
}

function buildCategoryOptions(rows: JudgeScorecardRow[]): Array<{ id: string; name: string }> {
  const categoriesById = new Map<string, string>();

  for (const row of rows) {
    categoriesById.set(row.categoryId, row.categoryName ?? row.categoryId);
  }

  return Array.from(categoriesById, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

function buildHeatOptions(rows: JudgeScorecardRow[], categoryId: string): Array<{ id: string; number: number; startsAt: string }> {
  const heatsById = new Map<string, { id: string; number: number; startsAt: string }>();

  for (const row of rows) {
    if (categoryId !== 'all' && row.categoryId !== categoryId) {
      continue;
    }

    heatsById.set(row.heatId, {
      id: row.heatId,
      number: row.heatNumber,
      startsAt: row.teamStartAt,
    });
  }

  return Array.from(heatsById.values()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.number - b.number);
}

function getDefaultHeatId(rows: JudgeScorecardRow[], currentHeatId: string | null): string {
  if (currentHeatId && rows.some((scorecard) => scorecard.heatId === currentHeatId)) {
    return currentHeatId;
  }

  return findFirstOpenScorecard(rows)?.heatId ?? 'all';
}

function findFirstOpenScorecard(rows: JudgeScorecardRow[]): JudgeScorecardRow | null {
  return rows.find((scorecard) => !isFinalScoreStatus(scorecard.scoreStatus)) ?? null;
}

function getScorecardStatusLabel(scorecard: JudgeScorecardRow, selected: boolean): 'Attivo' | 'In attesa' | 'Validato' | 'Corretto' {
  if (scorecard.scoreStatus === 'validated') return 'Validato';
  if (scorecard.scoreStatus === 'corrected') return 'Corretto';
  if (selected) return 'Attivo';
  return 'In attesa';
}

function isFinalScoreStatus(status: JudgeScorecardRow['scoreStatus']): boolean {
  return status === 'validated' || status === 'corrected';
}

function formatSaveStatus(status: SaveStatus): string {
  if (status === 'saving') return 'Salvataggio...';
  if (status === 'saved') return 'Salvato';
  if (status === 'error') return 'Errore salvataggio';
  if (status === 'offline') return 'Offline';
  return 'Connessione attiva';
}

function formatHeatTime(value: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(new Date(value));
}
