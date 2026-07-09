'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { JudgeUtilityLink } from '@/lib/event-links.ts';

interface JudgesAdminClientProps {
  links: JudgeUtilityLink[];
}

export function JudgesAdminClient({ links }: JudgesAdminClientProps) {
  const [copiedStationId, setCopiedStationId] = useState<string | null>(null);

  async function copyUrl(link: JudgeUtilityLink) {
    if (!link.url) return;

    await window.navigator.clipboard.writeText(link.url);
    setCopiedStationId(link.stationId);
    window.setTimeout(() => setCopiedStationId(null), 1500);
  }

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="admin-judges-grid">
      {links.map((link) => (
        <article className="rounded-lg bg-white p-5 shadow-sm" data-testid={`judge-link-${link.stationId}`} key={link.stationId}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">{link.stationName}</h2>
              <p className="mt-1 text-sm font-semibold text-zinc-500">Race station {link.raceStationOrder}</p>
            </div>
            <span
              className={`rounded px-2 py-1 text-xs font-black uppercase ${
                link.ready ? 'bg-lime-100 text-lime-900' : 'bg-red-100 text-red-800'
              }`}
            >
              {link.ready ? 'Pronto' : 'Non configurato'}
            </span>
          </div>

          {link.qrDataUrl ? (
            <Image
              alt={`QR ${link.stationName}`}
              className="mt-4 rounded-md border border-zinc-200"
              height={160}
              src={link.qrDataUrl}
              unoptimized
              width={160}
            />
          ) : (
            <div className="mt-4 flex h-40 w-40 items-center justify-center rounded-md bg-zinc-100 text-sm font-bold text-zinc-500">
              QR non disponibile
            </div>
          )}

          <dl className="mt-4 grid gap-2 text-sm">
            <div>
              <dt className="font-bold text-zinc-500">Token</dt>
              <dd className="break-all font-mono text-xs">{link.token || '-'}</dd>
            </div>
            <div>
              <dt className="font-bold text-zinc-500">URL locale</dt>
              <dd className="break-all font-mono text-xs">{link.url || '-'}</dd>
            </div>
          </dl>

          <button
            className="mt-4 h-11 w-full rounded-md bg-zinc-950 font-black text-white disabled:bg-zinc-300"
            disabled={!link.url}
            onClick={() => copyUrl(link)}
            type="button"
          >
            {copiedStationId === link.stationId ? 'Copiato' : 'Copia URL'}
          </button>
        </article>
      ))}
    </section>
  );
}
