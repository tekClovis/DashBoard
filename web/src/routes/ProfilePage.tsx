import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { oauthStartUrl, useLogout, useLogoutAll, useMe, useUnlinkIdentity, type OAuthProvider } from '@/api/auth.js';
import { ApiError } from '@/api/client.js';
import { Button } from '@/components/ui/button.js';

/**
 * Matches features/oauth-login/mock.html's "Profile — linked accounts" card plus the
 * Logout/Logout-all controls that were provisionally on DashboardPlaceholderPage — see
 * features/frontend-shell/spec.md.
 */
export function ProfilePage() {
  const { data: me } = useMe();
  const unlink = useUnlinkIdentity();
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
    <div className="p-6">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold">Profile</h1>
          <p className="text-muted-foreground text-sm">
            {me.email} ({me.role})
          </p>
        </div>

        <div className="border-border bg-card rounded-lg border p-6">
          <Row label="Password" status={me.hasPassword ? 'set' : 'not set'} />
          <IdentityRow
            label="GitHub"
            linked={linked.has('GITHUB')}
            disableUnlink={soleLoginMethod}
            onLink={() => handleLink('github')}
            onUnlink={() => handleUnlink('github')}
          />
          <IdentityRow
            label="Google"
            linked={linked.has('GOOGLE')}
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
      </div>
    </div>
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
  disableUnlink,
  onLink,
  onUnlink,
}: {
  label: string;
  linked: boolean;
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
