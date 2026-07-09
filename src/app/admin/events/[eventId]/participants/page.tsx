import Link from 'next/link';
import { ParticipantsAdminClient } from './ParticipantsAdminClient';
import { demoCategories, demoParticipantMembers, demoParticipants } from '@/lib/demo-data.ts';

interface ParticipantsPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function ParticipantsPage({ params }: ParticipantsPageProps) {
  const { eventId } = await params;
  const categories = demoCategories.filter((category) => category.eventId === eventId);
  const participants = demoParticipants.filter((participant) => participant.eventId === eventId);
  const participantIds = new Set(participants.map((participant) => participant.id));
  const members = demoParticipantMembers.filter((member) => participantIds.has(member.participantId));

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-red-600">Admin</p>
            <h1 className="text-4xl font-black">Partecipanti e team</h1>
            <p className="mt-2 max-w-2xl text-zinc-600">
              Crea individual, team da 2 e team da 3 con membri e categoria. In questo blocco i dati sono locali demo;
              nel Blocco 3 verranno salvati su Supabase.
            </p>
          </div>
          <div className="flex gap-2">
            <Link className="rounded-md bg-white px-4 py-3 font-bold text-zinc-950 shadow-sm" href={`/admin/events/${eventId}/timeline`}>
              Timeline
            </Link>
            <Link className="rounded-md bg-zinc-950 px-4 py-3 font-bold text-white" href="/">
              Home
            </Link>
          </div>
        </header>

        <ParticipantsAdminClient categories={categories} eventId={eventId} members={members} participants={participants} />
      </div>
    </main>
  );
}
