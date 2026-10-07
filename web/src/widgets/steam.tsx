import type { WidgetDataMap } from '@dashboard/shared';
import { ago, WEEK_MS } from '@/lib/time.js';
import { Channel, Empty, Meter, Row, RowMeta, Rows, RowTitle, Stat, Thumb } from './parts.js';
import type { WidgetViewProps } from './registry.js';

const hours = (minutes: number) => (minutes / 60).toFixed(1);

export function RecentlyPlayedView({ data, compact }: WidgetViewProps) {
  const { games } = data as WidgetDataMap['steam.recently_played'];
  const total = games.reduce((sum, g) => sum + g.playtime2Weeks, 0);
  const top = Math.max(...games.map((g) => g.playtime2Weeks));
  return (
    <>
      <Channel>
        <span>Last 2 weeks</span>
      </Channel>
      {games.length === 0 ? (
        <Empty>No games played in the last 2 weeks.</Empty>
      ) : (
        <>
          {!compact && <Stat value={hours(total)} unit="h" label="played in total" />}
          <Rows>
            {games.map((g) => (
              <Row key={g.appId}>
                <Thumb src={g.imageUrl} width={64} height={30} />
                <RowTitle>{g.name}</RowTitle>
                <Meter share={top > 0 ? g.playtime2Weeks / top : 0} className="w-14" />
                <RowMeta mono className="min-w-[6ch] text-right">
                  {hours(g.playtime2Weeks)} h
                </RowMeta>
              </Row>
            ))}
          </Rows>
        </>
      )}
    </>
  );
}

export function GameNewsView({ data, compact }: WidgetViewProps) {
  const { gameName, items } = data as WidgetDataMap['steam.game_news'];
  const now = Date.now();
  const week = items.filter((i) => now - Date.parse(i.date) < WEEK_MS).length;
  return (
    <>
      <Channel>
        <span>{gameName}</span>
      </Channel>
      <div data-slot="game-id" className="flex items-end gap-3">
        <Thumb src={items[0]?.imageUrl} width={128} height={60} />
        {!compact && <Stat value={week} label="posts in the last 7 days" />}
      </div>
      {items.length === 0 ? (
        <Empty>No news for this game.</Empty>
      ) : (
        <Rows>
          {items.map((item) => (
            <Row key={item.id}>
              <Thumb src={item.imageUrl} width={64} height={30} />
              <RowTitle href={item.url}>{item.title}</RowTitle>
              <RowMeta className="@max-[420px]:hidden">{item.feedLabel}</RowMeta>
              <RowMeta mono>
                <time dateTime={item.date}>{ago(now - Date.parse(item.date))}</time>
              </RowMeta>
            </Row>
          ))}
        </Rows>
      )}
    </>
  );
}
