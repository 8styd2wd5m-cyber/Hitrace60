'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { EventUtilityLink, JudgeUtilityLink } from '@/lib/event-links.ts';

interface LinksClientProps {
  adminLinks: EventUtilityLink[];
  displayLink: EventUtilityLink;
  judgeLinks: JudgeUtilityLink[];
  source: 'supabase' | 'demo';
}

export function LinksClient({ adminLinks, displayLink, judgeLinks, source }: LinksClientProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [copyErrorUrl, setCopyErrorUrl] = useState<string | null>(null);
  const [runtimeOrigin, setRuntimeOrigin] = useState('');

  useEffect(() => {
    setRuntimeOrigin(window.location.origin);
  }, []);

  async function copyUrl(url: string) {
    if (!url) return;

    const copied = await copyText(url);

    if (!copied) {
      setCopyErrorUrl(url);
      window.setTimeout(() => setCopyErrorUrl(null), 3000);
      return;
    }

    setCopyErrorUrl(null);
    setCopiedUrl(url);
    window.setTimeout(() => setCopiedUrl(null), 1500);
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-lg bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-zinc-200 pb-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-black">Link gara</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Sorgente {source === 'supabase' ? 'DB reale' : 'fallback demo'}
              {runtimeOrigin ? ` · browser origin ${runtimeOrigin}` : ''}
            </p>
          </div>
          <span className="rounded-md bg-lime-100 px-3 py-2 text-sm font-black uppercase text-lime-950">Operativo</span>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[300px_1fr]">
          <article className="rounded-md border border-zinc-200 p-4">
            <h3 className="text-xl font-black">{displayLink.label}</h3>
            <Image
              alt="QR display live"
              className="mt-4 rounded-md border border-zinc-200"
              height={220}
              src={displayLink.qrDataUrl}
              unoptimized
              width={220}
            />
            <LinkLine
              copied={copiedUrl === displayLink.url}
              copyError={copyErrorUrl === displayLink.url}
              label="URL display"
              onCopy={() => copyUrl(displayLink.url)}
              url={displayLink.url}
            />
          </article>

          <div className="grid gap-3 md:grid-cols-2">
            {adminLinks.map((link) => (
              <article className="rounded-md border border-zinc-200 p-4" key={link.label}>
                <h3 className="text-lg font-black">{link.label}</h3>
                <LinkLine
                  copied={copiedUrl === link.url}
                  copyError={copyErrorUrl === link.url}
                  label="URL"
                  onCopy={() => copyUrl(link.url)}
                  url={link.url}
                />
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="live-links-judges">
        {judgeLinks.map((link) => (
          <article className="rounded-lg bg-white p-5 shadow-sm" data-testid={`live-link-${link.stationSlug}`} key={link.stationId}>
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
                {link.ready ? 'Pronto' : 'Mancante'}
              </span>
            </div>

            {link.qrDataUrl ? (
              <Image
                alt={`QR ${link.stationName}`}
                className="mt-4 rounded-md border border-zinc-200"
                height={180}
                src={link.qrDataUrl}
                unoptimized
                width={180}
              />
            ) : (
              <div className="mt-4 flex h-[180px] w-[180px] items-center justify-center rounded-md bg-zinc-100 text-sm font-bold text-zinc-500">
                QR non disponibile
              </div>
            )}

            <dl className="mt-4 grid gap-2 text-sm">
              <div>
                <dt className="font-bold text-zinc-500">Token</dt>
                <dd className="break-all font-mono text-xs">{link.token || '-'}</dd>
              </div>
              {link.missingReason ? (
                <div className="rounded-md bg-red-50 p-2 text-red-800">
                  <dt className="font-bold">Configurazione</dt>
                  <dd className="text-sm">{link.missingReason}</dd>
                </div>
              ) : null}
            </dl>

            <LinkLine
              copied={copiedUrl === link.url}
              copyError={copyErrorUrl === link.url}
              label="URL giudice"
              onCopy={() => copyUrl(link.url)}
              url={link.url}
            />
          </article>
        ))}
      </section>
    </div>
  );
}

function LinkLine({
  copied,
  copyError,
  label,
  onCopy,
  url,
}: {
  copied: boolean;
  copyError: boolean;
  label: string;
  onCopy: () => void;
  url: string;
}) {
  return (
    <div className="mt-4">
      <p className="text-sm font-bold text-zinc-500">{label}</p>
      <p className="mt-1 break-all rounded-md bg-zinc-100 px-3 py-2 font-mono text-xs">{url || '-'}</p>
      <button
        className="mt-3 h-11 w-full rounded-md bg-zinc-950 font-black text-white disabled:bg-zinc-300"
        disabled={!url}
        onClick={onCopy}
        type="button"
      >
        {copied ? 'Copiato' : 'Copia link'}
      </button>
      {copyError ? <p className="mt-2 text-sm font-bold text-amber-700">Copia manualmente il link.</p> : null}
    </div>
  );
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (window.navigator.clipboard?.writeText) {
      await window.navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fallback below handles non-secure contexts and browsers without Clipboard API.
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  return copied;
}
