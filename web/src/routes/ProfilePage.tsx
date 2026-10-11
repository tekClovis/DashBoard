import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  oauthStartUrl,
  useDeleteAccount,
  useLogout,
  useLogoutAll,
  useMe,
  useOAuthProviders,
  useUnlinkIdentity,
  type OAuthProvider,
} from '@/api/auth.js';
import { ApiError } from '@/api/client.js';
import { PageHead } from '@/components/page-head.js';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';

/**
 * Profile page: linked login methods, log out / log out of all devices, and account deletion.
 *
 * Link starts a full-page OAuth redirect; Unlink is disabled when it would remove the only login method.
 * Renders nothing until the current user loads.
 */
export function ProfilePage() {
  const { data: me } = useMe();
  const unlink = useUnlinkIdentity();
  const providers = useOAuthProviders().data;
  const logout = useLogout();
  const logoutAll = useLogoutAll();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [toast, setToast] = useState<string | null>(
    // Set by the oauth `link` callback redirect when the completed handshake's provider
    // identity is already linked to a different user (server/src/auth/oauth).
    searchParams.get('error') === 'IDENTITY_ALREADY_LINKED'
      ? 'That provider account is already linked to a different user.'
      : null,
  );

  if (!me) return null;

  const linked = new Set(me.identities.map((i) => i.provider));
  // Unlinking would leave no way to log back in — server also enforces this (LAST_LOGIN_METHOD).
  const soleLoginMethod = !me.hasPassword && me.identities.length === 1;

  function handleLink(provider: OAuthProvider) {
    setToast(null);
    // Real OAuth handshake required to link — no client-supplied providerUserId any more.
    window.location.href = oauthStartUrl(provider, 'link');
  }

  function handleUnlink(provider: OAuthProvider) {
    setToast(null);
    unlink.mutate(provider, {
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'LAST_LOGIN_METHOD') {
          setToast("Can't unlink your only remaining login method.");
        }
      },
    });
  }

  function onLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login') });
  }

  function onLogoutAll() {
    logoutAll.mutate(undefined, { onSuccess: () => navigate('/login') });
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <PageHead className="mb-0" title="Profile" sub="Your account and how you sign in." />
      <p className="text-muted-foreground text-sm">
        {me.email} ({me.role})
      </p>

      <div className="border-border bg-card rounded-lg border p-6">
        <Row label="Password" status={me.hasPassword ? 'set' : 'not set'} />
        <IdentityRow
          label="GitHub"
          linked={linked.has('GITHUB')}
          configured={providers?.github.configured}
          disableUnlink={soleLoginMethod}
          onLink={() => handleLink('github')}
          onUnlink={() => handleUnlink('github')}
        />
        <IdentityRow
          label="Google"
          linked={linked.has('GOOGLE')}
          configured={providers?.google.configured}
          disableUnlink={soleLoginMethod}
          onLink={() => handleLink('google')}
          onUnlink={() => handleUnlink('google')}
        />
        {toast && <p className="bg-muted mt-3 rounded-md px-3 py-2 text-sm">{toast}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" disabled={logout.isPending} onClick={onLogout}>
          Log out
        </Button>
        <Button variant="outline" disabled={logoutAll.isPending} onClick={onLogoutAll}>
          Log out of all devices
        </Button>
      </div>

      <DangerZone email={me.email} />
    </div>
  );
}

/** Account deletion behind a type-your-email confirmation dialog; on success navigates to /login with `accountDeleted` state. */
function DangerZone({ email }: { email: string }) {
  const del = useDeleteAccount();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    if (del.isPending) return;
    setOpen(next);
    setTyped('');
    setError(null);
  }

  function onConfirm() {
    setError(null);
    del.mutate(undefined, {
      onSuccess: () => navigate('/login', { state: { accountDeleted: true } }),
      onError: (err) =>
        setError(
          err instanceof ApiError && err.code === 'LAST_ADMIN'
            ? 'You’re the only admin. Promote another user to admin from the Admin page before deleting this account.'
            : 'Could not delete your account. Try again.',
        ),
    });
  }

  return (
    <section className="border-destructive/40 bg-card flex items-center justify-between gap-4 rounded-lg border p-6">
      <div>
        <h2 className="text-destructive text-sm font-semibold">Danger zone</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Permanently removes your account, dashboards, widgets, shares and service connections. This can’t be undone.
        </p>
      </div>
      <Button variant="destructive" onClick={() => onOpenChange(true)}>
        Delete account
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[min(420px,calc(100vw-2rem))]">
          <div>
            <DialogTitle className="text-base font-semibold">Delete your account?</DialogTitle>
            <DialogDescription className="text-muted-foreground mt-0.5 text-[0.8125rem]">
              This permanently deletes your account, dashboards, widgets, shares and service connections. Dashboards you
              shared that someone already accepted stay with them. This can’t be undone.
            </DialogDescription>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="delete-email">
              Type <b className="font-mono">{email}</b> to confirm
            </Label>
            <Input
              id="delete-email"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              disabled={del.isPending}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          {error && (
            <Alert tone="destructive">
              <AlertContent>
                <AlertTitle>Account not deleted</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </AlertContent>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={del.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive-solid"
              disabled={typed !== email || del.isPending}
              onClick={onConfirm}
            >
              {del.isPending ? 'Deleting…' : 'Delete account'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Row({ label, status }: { label: string; status: string }) {
  return (
    <div className="border-border flex items-center justify-between border-b py-2.5 last:border-none">
      <span>{label}</span>
      <span className="bg-secondary rounded-full px-2 py-0.5 text-xs">{status}</span>
    </div>
  );
}

function IdentityRow({
  label,
  linked,
  configured,
  disableUnlink,
  onLink,
  onUnlink,
}: {
  label: string;
  linked: boolean;
  /** `false` when the server has no credentials for this provider: Link is disabled (enabled while unknown). */
  configured: boolean | undefined;
  disableUnlink: boolean;
  onLink: () => void;
  onUnlink: () => void;
}) {
  return (
    <div className="border-border flex items-center justify-between border-b py-2.5 last:border-none">
      <span>{label}</span>
      <span className="text-muted-foreground text-sm">{linked ? 'linked' : 'not linked'}</span>
      {linked && disableUnlink ? (
        <span className="text-muted-foreground text-xs" title="Your only remaining login method">
          Unlink
        </span>
      ) : !linked && configured === false ? (
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">not configured</span>
          <button type="button" disabled className="border-border rounded-md border px-2 py-1 text-xs opacity-50">
            Link
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="border-border rounded-md border px-2 py-1 text-xs"
          onClick={linked ? onUnlink : onLink}
        >
          {linked ? 'Unlink' : 'Link'}
        </button>
      )}
    </div>
  );
}
