import type { ConnectionEntry } from '@dashboard/shared';
import { CloudSun, Gamepad2, GitCommitHorizontal, Plug, SquarePlay, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useCatalog } from '@/api/catalog.js';
import { startConnect, useConnections, useDisconnect } from '@/api/connections.js';
import { useDashboards } from '@/api/dashboards.js';
import { useWidgetsOf } from '@/api/widgets.js';
import { PageHead } from '@/components/page-head.js';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { Lamp } from '@/components/ui/lamp.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { cn } from '@/lib/utils.js';

interface ServiceMeta {
  label: string;
  provider?: string;
  signIn: string;
  icon: LucideIcon;
}

const SERVICES: Record<string, ServiceMeta> = {
  weather: { label: 'Weather', provider: 'Open-Meteo', signIn: 'No account needed', icon: CloudSun },
  github: { label: 'GitHub', signIn: 'OAuth', icon: GitCommitHorizontal },
  steam: { label: 'Steam', signIn: 'OpenID', icon: Gamepad2 },
  youtube: { label: 'YouTube', signIn: 'Google OAuth', icon: SquarePlay },
};

const metaOf = (service: string): ServiceMeta => SERVICES[service] ?? { label: service, signIn: '', icon: Plug };

/** `recent_commits` → `Recent commits`. */
const widgetLabel = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).replaceAll('_', ' ');

/** Desktop: four columns; 375: name + status on top, actions full-width below (design-reference Services). */
const rowClass =
  'grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_170px_240px] md:gap-4';

/** Matches mocks/index.html#screen=services (and `services=reauth` for an expired connection). */
export function ConnectionsPage() {
  const { data, isPending } = useConnections();
  const { data: catalog } = useCatalog();
  const disconnect = useDisconnect();
  const expired = data?.connections.filter((c) => c.connected && c.status === 'REAUTH') ?? [];
  // Affected-widget counts for the expired alert; only fetched when something has expired.
  const { data: dashboards } = useDashboards({ enabled: expired.length > 0 });
  const widgets = useWidgetsOf(dashboards?.dashboards.map((d) => d.id));
  const rows: ConnectionEntry[] =
    data?.connections ?? Object.keys(SERVICES).map((service) => ({ service, connected: false, status: 'OK' }));

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHead
        title="Services"
        sub="Connect accounts so their widgets can fetch data. Disconnecting stops those widgets but keeps them on your dashboards."
      />

      {expired.map(({ service }) => {
        const { label } = metaOf(service);
        const count = widgets?.filter((w) => w.service === service).length;
        const what = count ? `${count} ${label} widget${count === 1 ? '' : 's'}` : `${label} widgets`;
        return (
          <Alert key={service} tone="warning" className="mb-3">
            <TriangleAlert strokeWidth={1.75} aria-hidden />
            <AlertContent>
              <AlertTitle>{label} access expired</AlertTitle>
              <AlertDescription>
                Your {what} stopped updating. Reconnect to resume them. Their settings are kept.
              </AlertDescription>
            </AlertContent>
          </Alert>
        );
      })}

      <Card role="table" aria-label="Services" aria-busy={isPending} className="overflow-hidden">
        <div role="row" className={cn(rowClass, 'text-muted-foreground hidden py-2 text-xs md:grid')}>
          <span role="columnheader">Service and widgets</span>
          <span role="columnheader">Sign-in</span>
          <span role="columnheader">Status</span>
          <span role="columnheader" className="sr-only">
            Actions
          </span>
        </div>
        {rows.map((entry) => (
          <ServiceRow
            key={entry.service}
            entry={entry}
            loading={isPending}
            widgets={catalog?.services.find((s) => s.name === entry.service)?.widgets.map((w) => widgetLabel(w.name)) ?? []}
            onDisconnect={(onSettled) => disconnect.mutate(entry.service, { onSettled })}
            disconnecting={disconnect.isPending && disconnect.variables === entry.service}
          />
        ))}
      </Card>
    </div>
  );
}

function ServiceRow({
  entry,
  loading,
  widgets,
  onDisconnect,
  disconnecting,
}: {
  entry: ConnectionEntry;
  loading: boolean;
  widgets: string[];
  onDisconnect: (onSettled: () => void) => void;
  disconnecting: boolean;
}) {
  const { label, provider, signIn, icon: Icon } = metaOf(entry.service);
  const alwaysOn = entry.service === 'weather';
  // Matches the mock's `services=loading`: weather is static, the others show skeleton status/actions.
  const skeleton = loading && !alwaysOn;

  return (
    <div role="row" className={rowClass}>
      <div role="cell" className="flex min-w-0 items-center gap-2.5">
        <span className="text-muted-foreground grid size-7 flex-none place-items-center rounded-md border">
          <Icon className="size-4" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <b className="block text-[0.8125rem] font-semibold">
            {label}
            {provider && <span className="text-muted-foreground font-normal"> ({provider})</span>}
          </b>
          <span className="text-muted-foreground text-xs">{widgets.join(', ')}</span>
        </div>
      </div>
      <div role="cell" className="text-muted-foreground hidden text-[0.8125rem] md:block">
        {signIn}
      </div>
      <div role="cell" className="max-md:col-start-2 max-md:row-start-1">
        {skeleton ? <Skeleton className="h-[18px] w-[90px]" /> : <StatusBadge alwaysOn={alwaysOn} entry={entry} />}
      </div>
      <div role="cell" className="flex flex-wrap items-center justify-end gap-1.5 max-md:col-span-full max-md:justify-start">
        {skeleton ? (
          <Skeleton className="h-7 w-[88px]" />
        ) : alwaysOn ? (
          <span className="text-muted-foreground text-xs">Nothing to connect</span>
        ) : entry.connected ? (
          <ConnectedActions
            reauth={entry.status === 'REAUTH'}
            onReconnect={() => startConnect(entry.service)}
            onDisconnect={onDisconnect}
            disconnecting={disconnecting}
          />
        ) : (
          <Button size="sm" onClick={() => startConnect(entry.service)}>
            Connect {label}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Disconnect asks inline ("Its widgets stop updating.") before calling the API; Cancel restores the row. */
function ConnectedActions({
  reauth,
  onReconnect,
  onDisconnect,
  disconnecting,
}: {
  reauth: boolean;
  onReconnect: () => void;
  onDisconnect: (onSettled: () => void) => void;
  disconnecting: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const hintId = useId();
  const disconnectRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  function toggle(next: boolean) {
    flushSync(() => setConfirming(next));
    (next ? cancelRef : disconnectRef).current?.focus();
  }

  if (confirming) {
    return (
      <>
        <span id={hintId} className="text-muted-foreground mr-1 text-xs">
          Its widgets stop updating.
        </span>
        <Button
          variant="destructive"
          size="sm"
          aria-describedby={hintId}
          disabled={disconnecting}
          onClick={() => onDisconnect(() => setConfirming(false))}
        >
          {disconnecting ? 'Disconnecting…' : 'Disconnect'}
        </Button>
        <Button ref={cancelRef} variant="ghost" size="sm" onClick={() => toggle(false)}>
          Cancel
        </Button>
      </>
    );
  }

  return (
    <>
      {reauth && (
        <Button size="sm" onClick={onReconnect}>
          Reconnect
        </Button>
      )}
      <Button ref={disconnectRef} variant="outline" size="sm" onClick={() => toggle(true)}>
        Disconnect
      </Button>
    </>
  );
}

function StatusBadge({ alwaysOn, entry }: { alwaysOn: boolean; entry: ConnectionEntry }) {
  if (alwaysOn) {
    return (
      <Badge variant="success">
        <Lamp state="live" />
        Always on
      </Badge>
    );
  }
  if (!entry.connected) {
    return (
      <Badge>
        <Lamp state="off" />
        Not connected
      </Badge>
    );
  }
  return entry.status === 'REAUTH' ? (
    <Badge variant="warning">
      <Lamp state="warn" />
      Reconnect needed
    </Badge>
  ) : (
    <Badge variant="success">
      <Lamp state="live" />
      Connected
    </Badge>
  );
}
