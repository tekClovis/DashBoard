import type { WidgetDataMap } from '@dashboard/shared';
import type { WidgetViewProps } from './registry.js';

const ROW = 'flex justify-between gap-3 border-t py-2 first:border-t-0';
const META = 'text-muted-foreground shrink-0 text-xs';

export function RecentlyPlayedView({ data }: WidgetViewProps) {
  const { games } = data as WidgetDataMap['steam.recently_played'];
  if (games.length === 0) return <p className="text-muted-foreground">No games played in the last 2 weeks.</p>;
  return (
    <ul>
      {games.map((game) => (
        <li key={game.appId} className={ROW}>
          <span>{game.name}</span>
          <span className={META}>{(game.playtime2Weeks / 60).toFixed(1)} hrs</span>
        </li>
      ))}
    </ul>
  );
}

export function GameNewsView({ data }: WidgetViewProps) {
  const { items } = data as WidgetDataMap['steam.game_news'];
  if (items.length === 0) return <p className="text-muted-foreground">No news for this game.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className={ROW}>
          {/^https?:\/\//i.test(item.url) ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline">
              {item.title}
            </a>
          ) : (
            <span>{item.title}</span>
          )}
          <time dateTime={item.date} className={META}>
            {timeAgo(item.date)}
          </time>
        </li>
      ))}
    </ul>
  );
}

function timeAgo(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return hours < 24 ? `${Math.max(hours, 0)}h ago` : `${Math.floor(hours / 24)}d ago`;
}
