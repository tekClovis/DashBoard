import type { ConnectionEntry } from '@dashboard/shared';
import { Link } from 'react-router';
import { startConnect, useConnections, useDisconnect } from '@/api/connections.js';
import { Button } from '@/components/ui/button.js';

const SERVICE_NAMES: Record<string, string> = {
  weather: 'Weather (Open-Meteo)',
  github: 'GitHub',
  steam: 'Steam',
  youtube: 'YouTube',
};

/** Matches features/connections-api/mock.html's Services list. */
export function ConnectionsPage() {
  const { data, isPending } = useConnections();
  const disconnect = useDisconnect();

  return (
    <div className="bg-background min-h-svh p-6">
      <div className="mx-auto max-w-[520px]">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Services</h1>
          <Link to="/d/placeholder" className="text-muted-foreground text-sm underline underline-offset-4">
            Back to dashboard
          </Link>
        </div>

        <div className="bg-card overflow-hidden rounded-lg border">
          {isPending && <p className="text-muted-foreground p-4 text-sm">Loading…</p>}
          {data?.connections.map((entry, i) => (
            <ServiceRow
              key={entry.service}
              entry={entry}
              isLast={i === data.connections.length - 1}
              onDisconnect={() => disconnect.mutate(entry.service)}
              disconnecting={disconnect.isPending && disconnect.variables === entry.service}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ServiceRow({
  entry,
  isLast,
  onDisconnect,
  disconnecting,
}: {
  entry: ConnectionEntry;
  isLast: boolean;
  onDisconnect: () => void;
  disconnecting: boolean;
}) {
  const alwaysOn = entry.service === 'weather';

  return (
    <div className={`flex items-center justify-between p-4 ${isLast ? '' : 'border-b'}`}>
      <div>
        <div className="text-sm font-semibold">{SERVICE_NAMES[entry.service] ?? entry.service}</div>
        <div className="text-muted-foreground text-xs">{entry.service}</div>
      </div>
      <div className="flex items-center gap-2.5">
        <Badge alwaysOn={alwaysOn} connected={entry.connected} status={entry.status} />
        {!alwaysOn &&
          (entry.connected ? (
            <Button variant="outline" size="sm" onClick={onDisconnect} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          ) : (
            <Button size="sm" onClick={() => startConnect(entry.service)}>
              Connect
            </Button>
          ))}
      </div>
    </div>
  );
}

function Badge({
  alwaysOn,
  connected,
  status,
}: {
  alwaysOn: boolean;
  connected: boolean;
  status: 'OK' | 'REAUTH';
}) {
  if (alwaysOn) {
    return <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-800">always on</span>;
  }
  if (!connected) {
    return <span className="bg-secondary rounded-full px-2.5 py-0.5 text-xs">not connected</span>;
  }
  return status === 'REAUTH' ? (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-800">REAUTH</span>
  ) : (
    <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-800">OK</span>
  );
}
