import { useEffect, useRef, useState } from 'react';
import type { ConnectionEntry } from '@dashboard/shared';
import { startConnect, useConnections, useDisconnect } from '@/api/connections.js';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { PageHead } from '@/components/page-head.js';
import { Button } from '@/components/ui/button.js';

const SERVICE_NAMES: Record<string, string> = {
  weather: 'Weather (Open-Meteo)',
  github: 'GitHub',
  steam: 'Steam',
  youtube: 'YouTube',
};

/**
 * Services page: lists each service's connection state with Connect, Disconnect and Reauthenticate actions.
 *
 * Reauthenticate disconnects the service, then starts the connect redirect; if the disconnect fails, no redirect starts.
 */
export function ConnectionsPage() {
  const { data, isPending } = useConnections();
  const disconnect = useDisconnect();
  // Own mutation: react-query only runs the per-mutate callbacks of a mutation's latest mutate() call.
  const reauthDisconnect = useDisconnect();
  const [reauthing, setReauthing] = useState<{ service: string; redirecting: boolean } | null>(null);
  const [reauthError, setReauthError] = useState<string | null>(null);

  const reauth = (service: string) => {
    setReauthing({ service, redirecting: false });
    setReauthError(null);
    // Stay in the redirecting state after success: startConnect is a full-page redirect, and the
    // refetched connection list already shows the service as not connected.
    reauthDisconnect.mutate(service, {
      onSuccess: () => {
        setReauthing({ service, redirecting: true });
        startConnect(service);
      },
      onError: () => {
        setReauthing(null);
        setReauthError(service);
      },
    });
  };

  return (
    <div className="mx-auto max-w-[520px]">
      <PageHead
        title="Services"
        sub="Connect accounts so their widgets can fetch data. Disconnecting stops those widgets but keeps them on your dashboards."
      />

      <div className="bg-card overflow-hidden rounded-lg border">
        {isPending && <p className="text-muted-foreground p-4 text-sm">Loading…</p>}
        {data?.connections.map((entry, i) => (
          <ServiceRow
            key={entry.service}
            entry={entry}
            isLast={i === data.connections.length - 1}
            onDisconnect={() => disconnect.mutate(entry.service)}
            disconnecting={disconnect.isPending && disconnect.variables === entry.service}
            onReauth={() => reauth(entry.service)}
            reauthPhase={
              reauthing?.service === entry.service ? (reauthing.redirecting ? 'redirecting' : 'pending') : 'idle'
            }
            reauthError={reauthError === entry.service}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceRow({
  entry,
  isLast,
  onDisconnect,
  disconnecting,
  onReauth,
  reauthPhase,
  reauthError,
}: {
  entry: ConnectionEntry;
  isLast: boolean;
  onDisconnect: () => void;
  disconnecting: boolean;
  onReauth: () => void;
  reauthPhase: 'idle' | 'pending' | 'redirecting';
  reauthError: boolean;
}) {
  const alwaysOn = entry.service === 'weather';
  const reauthButton = useRef<HTMLButtonElement>(null);
  const reauthenticating = reauthPhase !== 'idle';
  const name = SERVICE_NAMES[entry.service] ?? entry.service;

  useEffect(() => {
    if (reauthError) reauthButton.current?.focus();
  }, [reauthError]);

  return (
    <div className={`flex flex-wrap items-center justify-between p-4 ${isLast ? '' : 'border-b'}`}>
      <div>
        <div className="text-sm font-semibold">{SERVICE_NAMES[entry.service] ?? entry.service}</div>
        <div className="text-muted-foreground text-xs">{entry.service}</div>
      </div>
      <div className="flex items-center gap-2.5">
        <Badge alwaysOn={alwaysOn} connected={entry.connected} status={entry.status} />
        {!alwaysOn &&
          (reauthenticating || (entry.connected && entry.status === 'REAUTH') ? (
            <Button
              ref={reauthButton}
              size="sm"
              onClick={onReauth}
              disabled={reauthenticating}
              aria-busy={reauthenticating || undefined}
            >
              {reauthPhase === 'redirecting'
                ? 'Redirecting…'
                : reauthPhase === 'pending'
                  ? 'Reauthenticating…'
                  : 'Reauthenticate'}
            </Button>
          ) : entry.connected ? (
            <Button variant="outline" size="sm" onClick={onDisconnect} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          ) : (
            <Button size="sm" onClick={() => startConnect(entry.service)}>
              Connect
            </Button>
          ))}
      </div>
      {reauthError && (
        <Alert tone="destructive" className="mt-3 basis-full">
          <AlertContent>
            <AlertTitle>Could not disconnect {name}</AlertTitle>
            <AlertDescription>Nothing was changed and no sign-in was started. Try again.</AlertDescription>
          </AlertContent>
        </Alert>
      )}
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
