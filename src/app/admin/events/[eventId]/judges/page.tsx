import Link from 'next/link';
import QRCode from 'qrcode';
import { JudgesAdminClient, type JudgeStationLink } from './JudgesAdminClient';
import { HITRACE_JUDGE_TOKENS_BY_STATION_SLUG } from '@/lib/constants.ts';
import { demoStations } from '@/lib/demo-data.ts';

interface JudgesPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

const DEFAULT_LOCAL_BASE_URL = 'http://192.168.31.245:3000';

export default async function JudgesPage({ params }: JudgesPageProps) {
  const { eventId } = await params;
  const baseUrl = process.env.NEXT_PUBLIC_JUDGE_BASE_URL ?? DEFAULT_LOCAL_BASE_URL;
  const stations = demoStations.filter((station) => station.eventId === eventId && station.isScored);
  const links: JudgeStationLink[] = await Promise.all(
    stations.map(async (station) => {
      const token = HITRACE_JUDGE_TOKENS_BY_STATION_SLUG[station.slug] ?? '';
      const url = token ? `${baseUrl}/judge/${token}` : '';

      return {
        stationId: station.id,
        stationName: station.name,
        token,
        url,
        raceStationOrder: station.raceStationOrder ?? station.stationOrder * 2 - 1,
        ready: Boolean(token),
        qrDataUrl: token ? await QRCode.toDataURL(url, { margin: 1, width: 160 }) : null,
      };
    }),
  );

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.2em] text-red-600">Admin</p>
            <h1 className="text-4xl font-black">URL giudici HITRACE60</h1>
            <p className="mt-2 max-w-2xl text-zinc-600">
              Link locali per smartphone giudici. Ogni token apre una sola stazione e usa il race station order reale.
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
        <JudgesAdminClient links={links} />
      </div>
    </main>
  );
}
