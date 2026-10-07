import type { DashboardEntry, IncomingShareEntry, ShareStatus } from '@dashboard/shared';
import { Inbox, Share2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useDashboards } from '@/api/dashboards.js';
import { useAcceptShare, useDeclineShare, useIncomingShares, useSentShares, useShareDashboard } from '@/api/shares.js';
import { ApiError } from '@/api/client.js';
import { FieldError } from '@/components/ParamForm.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Skeleton } from '@/components/ui/skeleton.js';

const STATUS_LABEL: Record<ShareStatus, string> = { PENDING: 'Waiting', ADDED: 'Added a copy', DECLINED: 'Declined' };

function SentList({ dashboardId }: { dashboardId: string }) {
  const shares = useSentShares(dashboardId).data?.shares ?? [];
  if (shares.length === 0) return null;
  return (
    <div>
      <p className="text-muted-foreground mb-1 text-xs">Shared from this dashboard</p>
      <ul role="list" className="grid gap-1">
        {shares.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 text-[0.8125rem]">
            <span className="truncate font-mono">{s.toEmail}</span>
            <span className="text-muted-foreground shrink-0 text-xs">{STATUS_LABEL[s.status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Maps an API error code from sharing to user-facing copy; unknown errors get a generic message. */
function shareErrorMessage(error: unknown, email: string): string {
  const code = error instanceof ApiError ? error.code : null;
  if (code === 'UNKNOWN_USER') return `No user found for “${email}”. Check the spelling and try again.`;
  if (code === 'ALREADY_SHARED') return `Already shared with ${email}. They haven’t answered yet.`;
  if (code === 'CANNOT_SHARE_WITH_SELF') return 'You can’t share a dashboard with yourself.';
  return 'Couldn’t send the dashboard. Try again.';
}

/** Dialog body: send a copy of `dashboard` to another user by email, then see who has answered. */
export function ShareDialog({ dashboard }: { dashboard: DashboardEntry }) {
  const share = useShareDashboard();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    setSentTo(null);
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
    <div className="grid gap-4">
      <div>
        <DialogTitle className="text-base font-semibold">Share “{dashboard.name}”</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-0.5 text-[0.8125rem]">
          They get a copy to add to their dashboards. Later changes aren’t synced.
        </DialogDescription>
      </div>
      {sentTo ? (
        <p role="status" className="text-success text-[0.8125rem]">
          Sent to {sentTo}. It shows up in their “Shared with you” list.
        </p>
      ) : (
        <form id="share-form" onSubmit={submit} noValidate className="grid gap-1.5">
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
            }}
          />
          {error && <FieldError id="share-email-err">{error}</FieldError>}
        </form>
      )}
      <SentList dashboardId={dashboard.id} />
      <div className="flex justify-end gap-2">
        {sentTo ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSentTo(null);
                setEmail('');
              }}
            >
              Share with someone else
            </Button>
            <DialogClose asChild>
              <Button type="button">Done</Button>
            </DialogClose>
          </>
        ) : (
          <>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Close
              </Button>
            </DialogClose>
            <Button type="submit" form="share-form" disabled={share.isPending}>
              {share.isPending ? 'Sending…' : 'Send'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Dashboard header action: opens the share dialog for `dashboardId`. */
export function ShareButton({ dashboardId }: { dashboardId: string }) {
  const [open, setOpen] = useState(false);
  const dashboard = useDashboards().data?.dashboards.find((d) => d.id === dashboardId);
  return (
    <>
      <Button variant="outline" disabled={!dashboard} onClick={() => setOpen(true)}>
        <Share2 />
        Share
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(420px,calc(100vw-2rem))]">
          {dashboard && <ShareDialog dashboard={dashboard} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Top-bar action: "Shared with you" with the pending count; opens the incoming-shares dialog. */
export function InboxButton() {
  const [open, setOpen] = useState(false);
  const count = useIncomingShares().data?.shares.length ?? 0;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Inbox strokeWidth={1.75} />
        <span className="max-md:sr-only">Shared with you</span>
        {count > 0 && (
          <span className="bg-primary text-primary-foreground rounded-sm px-1.5 font-mono text-[0.6875rem]">
            {count}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(520px,calc(100vw-2rem))]">
          <IncomingSharesDialog onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ShareRow({ share, onAccepted, onDismiss }: { share: IncomingShareEntry; onAccepted: () => void; onDismiss: () => void }) {
  const navigate = useNavigate();
  const accept = useAcceptShare();
  const decline = useDeclineShare();
  const [confirming, setConfirming] = useState(false);
  const busy = accept.isPending || decline.isPending;
  const gone = accept.error instanceof ApiError && accept.error.status === 404;
  const failed = !gone && (accept.isError || decline.isError);

  return (
    <li className="grid gap-2 rounded-md border p-3">
      <div className="min-w-0">
        <div className="truncate font-semibold">{share.dashboardName}</div>
        <div className="text-muted-foreground text-xs">
          From <span className="font-mono">{share.fromEmail}</span> · {share.widgetCount}{' '}
          {share.widgetCount === 1 ? 'widget' : 'widgets'}
        </div>
      </div>
      {gone ? (
        <>
          <FieldError id={`share-gone-${share.id}`}>This share is no longer available</FieldError>
          <p className="text-muted-foreground text-xs">The sender removed it, or it was meant for someone else.</p>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        </>
      ) : (
        <>
          {failed && <FieldError id={`share-err-${share.id}`}>Something went wrong. Try again.</FieldError>}
          {confirming ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="text-muted-foreground mr-auto text-xs">
                Decline this share? {share.fromEmail} isn’t told.
              </span>
              <Button variant="destructive-solid" size="sm" disabled={busy} onClick={() => decline.mutate(share.id)}>
                Decline
              </Button>
              <Button variant="ghost" size="sm" autoFocus onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
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
          )}
        </>
      )}
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
              <ShareRow key={s.id} share={s} onAccepted={onClose} onDismiss={() => void refetch()} />
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
