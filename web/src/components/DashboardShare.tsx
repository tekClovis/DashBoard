import type { DashboardEntry, IncomingShareEntry } from '@dashboard/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useAcceptShare, useDeclineShare, useIncomingShares, useShareDashboard } from '@/api/shares.js';
import { ApiError } from '@/api/client.js';
import { FieldError } from '@/components/ParamForm.js';
import { Button } from '@/components/ui/button.js';
import { DialogClose, DialogDescription, DialogTitle } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Skeleton } from '@/components/ui/skeleton.js';

function shareErrorMessage(error: unknown, email: string): string {
  const code = error instanceof ApiError ? error.code : null;
  if (code === 'UNKNOWN_USER') return `No user found for “${email}”. Check the spelling and try again.`;
  if (code === 'CANNOT_SHARE_WITH_SELF') return 'You can’t share a dashboard with yourself.';
  return 'Couldn’t send the dashboard. Try again.';
}

/** Dialog body: send a copy of `dashboard` to another user by email. */
export function ShareDialog({ dashboard }: { dashboard: DashboardEntry }) {
  const share = useShareDashboard();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return setError('Enter an email address.');
    setError(null);
    share.mutate(
      { id: dashboard.id, email: trimmed },
      {
        onSuccess: () => setSentTo(trimmed),
        onError: (err) => setError(shareErrorMessage(err, trimmed)),
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div>
        <DialogTitle className="text-base font-semibold">Share “{dashboard.name}”</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-0.5 text-[0.8125rem]">
          They get a copy to add to their dashboards. Later changes aren’t synced.
        </DialogDescription>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="share-email">Recipient email</Label>
        <Input
          id="share-email"
          type="email"
          value={email}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'share-email-err' : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
            setSentTo(null);
          }}
        />
        {error && <FieldError id="share-email-err">{error}</FieldError>}
        {sentTo && (
          <p role="status" className="text-success text-xs">
            Sent to {sentTo}. It shows up in their “Shared with you” list.
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Close
          </Button>
        </DialogClose>
        <Button type="submit" disabled={share.isPending}>
          {share.isPending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  );
}

function ShareRow({ share, onAccepted }: { share: IncomingShareEntry; onAccepted: () => void }) {
  const navigate = useNavigate();
  const accept = useAcceptShare();
  const decline = useDeclineShare();
  const busy = accept.isPending || decline.isPending;
  const failed = accept.isError || decline.isError;

  return (
    <li className="grid gap-2 rounded-md border p-3">
      <div className="min-w-0">
        <div className="truncate font-semibold">{share.dashboardName}</div>
        <div className="text-muted-foreground text-xs">
          From <span className="font-mono">{share.fromEmail}</span> · {share.widgetCount}{' '}
          {share.widgetCount === 1 ? 'widget' : 'widgets'}
        </div>
      </div>
      {failed && <FieldError id={`share-err-${share.id}`}>Something went wrong. Try again.</FieldError>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => decline.mutate(share.id)}>
          Decline
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            accept.mutate(share.id, {
              onSuccess: (created) => {
                onAccepted();
                void navigate(`/d/${created.id}`);
              },
            })
          }
        >
          {accept.isPending ? 'Adding…' : 'Add to my dashboards'}
        </Button>
      </div>
    </li>
  );
}

/** Dialog body: pending shares sent to me, each addable (personal copy) or declinable. */
export function IncomingSharesDialog({ onClose }: { onClose: () => void }) {
  const { data, isPending, isError, refetch } = useIncomingShares();
  const shares = data?.shares ?? [];

  return (
    <div className="grid gap-4">
      <div>
        <DialogTitle className="text-base font-semibold">Shared with you</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-0.5 text-[0.8125rem]">
          Dashboards other users sent you. Adding one makes your own copy.
        </DialogDescription>
      </div>
      {isPending && (
        <div aria-busy="true" className="grid gap-2">
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {isError && (
        <div className="grid gap-2 text-[0.8125rem]">
          <p className="text-destructive">Couldn’t load shared dashboards</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data &&
        (shares.length === 0 ? (
          <p className="text-muted-foreground text-[0.8125rem]">Nothing shared with you right now.</p>
        ) : (
          <ul role="list" className="grid gap-2">
            {shares.map((s) => (
              <ShareRow key={s.id} share={s} onAccepted={onClose} />
            ))}
          </ul>
        ))}
      <div className="flex justify-end">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Close
          </Button>
        </DialogClose>
      </div>
    </div>
  );
}
