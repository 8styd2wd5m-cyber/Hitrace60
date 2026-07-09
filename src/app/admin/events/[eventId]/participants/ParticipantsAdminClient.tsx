'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteParticipantAction, saveParticipantAction } from './actions';
import {
  buildParticipantFromInput,
  deleteParticipant,
  groupMembersByParticipant,
  upsertParticipant,
  validateParticipantInput,
  type ParticipantInput,
} from '@/lib/participants.ts';
import type { Category, Participant, ParticipantMember, ParticipantWithMembers } from '@/lib/types.ts';

interface ParticipantsAdminClientProps {
  categories: Category[];
  eventId: string;
  members: ParticipantMember[];
  participants: Participant[];
  routeEventId: string;
  source: 'supabase' | 'demo';
}

const emptyMember = { firstName: '', lastName: '', gender: 'M' as const };

export function ParticipantsAdminClient({
  categories,
  eventId,
  members,
  participants,
  routeEventId,
  source,
}: ParticipantsAdminClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const membersByParticipant = useMemo(() => groupMembersByParticipant(members), [members]);
  const initialParticipants = useMemo<ParticipantWithMembers[]>(
    () =>
      participants.map((participant) => ({
        ...participant,
        members: membersByParticipant.get(participant.id) ?? [],
      })),
    [membersByParticipant, participants],
  );
  const [items, setItems] = useState(initialParticipants);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ParticipantInput>(() => createEmptyInput(eventId, categories[0]));
  const [errors, setErrors] = useState<string[]>([]);

  const selectedCategory = categories.find((category) => category.id === form.categoryId) ?? categories[0];
  const editingParticipant = editingId ? items.find((item) => item.id === editingId) : null;

  useEffect(() => {
    setItems(initialParticipants);
  }, [initialParticipants]);

  useEffect(() => {
    setForm((currentForm) => ({
      ...currentForm,
      eventId,
      categoryId: currentForm.categoryId || categories[0]?.id || '',
      members: currentForm.members.length ? currentForm.members : buildMemberSlots(categories[0]?.teamSize ?? 1),
    }));
  }, [categories, eventId]);

  function updateCategory(categoryId: string) {
    const category = categories.find((categoryItem) => categoryItem.id === categoryId);

    setForm((currentForm) => ({
      ...currentForm,
      categoryId,
      members: buildMemberSlots(category?.teamSize ?? 1, currentForm.members),
    }));
  }

  function updateMember(index: number, field: 'firstName' | 'lastName' | 'gender', value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      members: currentForm.members.map((member, memberIndex) =>
        memberIndex === index
          ? {
              ...member,
              [field]: value,
            }
          : member,
      ),
    }));
  }

  function submitForm() {
    const validation = validateParticipantInput(form, categories);

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    if (source === 'supabase') {
      startTransition(async () => {
        const result = await saveParticipantAction(routeEventId, form);

        if (!result.ok) {
          setErrors(result.errors);
          return;
        }

        const nextParticipant = {
          ...result.participant,
          members: result.members,
        };
        setItems((currentItems) => upsertParticipant(currentItems, nextParticipant));
        setErrors([]);
        resetForm();
        router.refresh();
      });
      return;
    }

    const nextParticipant = buildParticipantFromInput(form, categories);
    setItems((currentItems) => upsertParticipant(currentItems, nextParticipant));
    setErrors([]);
    resetForm();
  }

  function startEdit(participant: ParticipantWithMembers) {
    setEditingId(participant.id);
    setErrors([]);
    setForm({
      id: participant.id,
      eventId: participant.eventId,
      categoryId: participant.categoryId,
      displayName: participant.displayName,
      bibNumber: participant.bibNumber ?? '',
      seedOrder: participant.seedOrder,
      members: participant.members.map((member) => ({
        firstName: member.firstName,
        lastName: member.lastName,
        gender: member.gender ?? 'M',
      })),
    });
  }

  function removeParticipant(participantId: string) {
    if (source === 'supabase') {
      startTransition(async () => {
        const result = await deleteParticipantAction(routeEventId, eventId, participantId);

        if (!result.ok) {
          setErrors(result.errors);
          return;
        }

        setItems((currentItems) => deleteParticipant(currentItems, participantId));
        setErrors([]);

        if (participantId === editingId) {
          resetForm();
        }

        router.refresh();
      });
      return;
    }

    setItems((currentItems) => deleteParticipant(currentItems, participantId));

    if (participantId === editingId) {
      resetForm();
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(createEmptyInput(eventId, categories[0]));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
      <section className="rounded-lg bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">{editingParticipant ? 'Modifica partecipante' : 'Nuovo partecipante'}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {selectedCategory?.name} · {selectedCategory?.teamSize ?? 1} membro/i
            </p>
          </div>
          {editingId ? (
            <button className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-bold" onClick={resetForm} type="button">
              Annulla
            </button>
          ) : null}
        </div>

        {errors.length ? (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4">
          <label className="text-sm font-bold">
            Categoria
            <select
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
              onChange={(event) => updateCategory(event.target.value)}
              value={form.categoryId}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-bold">
            Nome team/atleta
            <input
              className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, displayName: event.target.value }))}
              placeholder="Es. Team Alpha"
              value={form.displayName}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold">
              Bib
              <input
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
                onChange={(event) => setForm((currentForm) => ({ ...currentForm, bibNumber: event.target.value }))}
                placeholder="42"
                value={form.bibNumber ?? ''}
              />
            </label>
            <label className="text-sm font-bold">
              Seed order
              <input
                className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-3"
                min={0}
                onChange={(event) => setForm((currentForm) => ({ ...currentForm, seedOrder: Number(event.target.value) }))}
                type="number"
                value={form.seedOrder}
              />
            </label>
          </div>

          <div className="rounded-md border border-zinc-200 p-4">
            <h3 className="font-black">Membri</h3>
            <div className="mt-3 grid gap-3">
              {form.members.map((member, index) => (
                <div className="grid gap-2 rounded-md bg-zinc-50 p-3" key={index}>
                  <p className="text-xs font-black uppercase text-zinc-500">Membro {index + 1}</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_86px]">
                    <input
                      aria-label={`Membro ${index + 1} nome`}
                      className="rounded-md border border-zinc-300 px-3 py-3"
                      onChange={(event) => updateMember(index, 'firstName', event.target.value)}
                      placeholder="Nome"
                      value={member.firstName}
                    />
                    <input
                      aria-label={`Membro ${index + 1} cognome`}
                      className="rounded-md border border-zinc-300 px-3 py-3"
                      onChange={(event) => updateMember(index, 'lastName', event.target.value)}
                      placeholder="Cognome"
                      value={member.lastName}
                    />
                    <select
                      className="rounded-md border border-zinc-300 px-3 py-3"
                      onChange={(event) => updateMember(index, 'gender', event.target.value)}
                      value={member.gender}
                    >
                      <option value="M">M</option>
                      <option value="F">F</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            className="rounded-md bg-zinc-950 px-4 py-4 text-lg font-black text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
            disabled={isPending || categories.length === 0}
            onClick={submitForm}
            type="button"
          >
            {isPending ? 'Salvataggio...' : editingParticipant ? 'Salva modifiche' : 'Crea partecipante'}
          </button>
        </div>
      </section>

      <section className="rounded-lg bg-white p-5 shadow-sm" data-testid="participants-admin">
        <div className="flex flex-col justify-between gap-3 border-b border-zinc-200 pb-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-black">Partecipanti</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {items.length} iscritti · {source === 'supabase' ? 'persistenza Supabase attiva' : 'fallback locale demo'}
            </p>
          </div>
          <span className="rounded-md bg-lime-200 px-3 py-2 text-sm font-black">
            {source === 'supabase' ? 'DB reale' : 'CRUD locale'}
          </span>
        </div>

        <div className="mt-5 grid gap-3">
          {items.map((participant) => {
            const category = categories.find((categoryItem) => categoryItem.id === participant.categoryId);

            return (
              <article className="rounded-md border border-zinc-200 p-4" key={participant.id}>
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-zinc-950 px-2 py-1 text-xs font-black text-white">
                        {category?.code ?? 'N/D'}
                      </span>
                      {participant.bibNumber ? (
                        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-bold">Bib {participant.bibNumber}</span>
                      ) : null}
                    </div>
                    <h3 className="mt-2 truncate text-2xl font-black">{participant.displayName}</h3>
                    <p className="mt-1 text-sm font-semibold text-zinc-500">
                      Seed {participant.seedOrder} · {participant.members.length} membro/i
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-md bg-zinc-100 px-3 py-2 font-bold" onClick={() => startEdit(participant)} type="button">
                      Modifica
                    </button>
                    <button
                      className="rounded-md bg-red-50 px-3 py-2 font-bold text-red-700 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                      disabled={isPending}
                      onClick={() => removeParticipant(participant.id)}
                      type="button"
                    >
                      Elimina
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {participant.members.map((member) => (
                    <span className="rounded-md bg-zinc-100 px-3 py-2 text-sm font-semibold" key={member.id}>
                      {member.firstName} {member.lastName} · {member.gender}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function createEmptyInput(eventId: string, category?: Category): ParticipantInput {
  return {
    eventId,
    categoryId: category?.id ?? '',
    displayName: '',
    bibNumber: '',
    seedOrder: 0,
    members: buildMemberSlots(category?.teamSize ?? 1),
  };
}

function buildMemberSlots(count: number, currentMembers: ParticipantInput['members'] = []): ParticipantInput['members'] {
  return Array.from({ length: count }, (_, index) => currentMembers[index] ?? emptyMember);
}
