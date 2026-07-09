import Link from 'next/link';
import { JudgeScoreClient } from './JudgeScoreClient';
import { loadJudgePageData } from '@/lib/judge-data.ts';

interface JudgePageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function JudgePage({ params }: JudgePageProps) {
  const { token } = await params;
  const result = await loadJudgePageData(token);

  if (result.status !== 'ready') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-white">
        <div className="max-w-md rounded-lg bg-white p-6 text-zinc-950">
          <h1 className="text-3xl font-black">
            {result.status === 'invalid_token' ? 'Token giudice non valido' : 'Configurazione giudice incompleta'}
          </h1>
          <p className="mt-3 text-zinc-600">{result.message}</p>
          <Link className="mt-5 inline-block rounded-md bg-zinc-950 px-4 py-3 font-bold text-white" href="/">
            Torna alla home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <JudgeScoreClient
      currentHeatId={result.currentHeatId}
      judgeToken={token}
      showDataSourceBadge={process.env.NODE_ENV !== 'production'}
      source={result.source}
      stationScorecards={result.stationScorecards}
    />
  );
}
