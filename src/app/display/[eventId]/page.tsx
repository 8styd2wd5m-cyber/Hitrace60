import { LeaderboardDisplayClient } from './LeaderboardDisplayClient';
import { loadDisplayPageData } from '@/lib/display-data.ts';

interface DisplayPageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function DisplayPage({ params }: DisplayPageProps) {
  const { eventId } = await params;
  const data = await loadDisplayPageData(eventId);

  return (
    <LeaderboardDisplayClient
      categories={data.categories}
      heats={data.heats}
      participants={data.participants}
      resolvedEventId={data.resolvedEventId}
      scores={data.scores}
      source={data.source}
      stations={data.stations}
    />
  );
}
