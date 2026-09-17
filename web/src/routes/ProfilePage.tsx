import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { oauthStartUrl, useMe, useUnlinkIdentity, type OAuthProvider } from '@/api/auth.js';
import { ApiError } from '@/api/client.js';
import { ThemeToggle } from '@/components/theme-toggle.js';

/**
 * Minimal linked-accounts panel — matches features/oauth-login/mock.html's "Profile —
 * linked accounts" card (password badge, GitHub/Google rows, link/unlink buttons, and a
 * toast when unlinking the only remaining login method). A full Profile page is
 * `frontend-shell`'s scope.
 */
export function ProfilePage() {
  const { data: me } = useMe();
  const unlink = useUnlinkIdentity();
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

  return (
    <div className="bg-background min-h-svh p-6">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Profile — linked accounts</h1>
          <ThemeToggle />
        </div>
        <div className="border-border bg-card rounded-lg border p-6">
          <Row label="Password" status={me.hasPassword ? 'set' : 'not set'} />
          <IdentityRow
            label="GitHub"
            linked={linked.has('GITHUB')}
            onLink={() => handleLink('github')}
            onUnlink={() => handleUnlink('github')}
          />
          <IdentityRow
            label="Google"
            linked={linked.has('GOOGLE')}
            onLink={() => handleLink('google')}
            onUnlink={() => handleUnlink('google')}
          />
          {toast && <p className="bg-muted mt-3 rounded-md px-3 py-2 text-sm">{toast}</p>}
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
  onLink,
  onUnlink,
}: {
  label: string;
  linked: boolean;
  onLink: () => void;
  onUnlink: () => void;
}) {
  return (
    <div className="border-border flex items-center justify-between border-b py-2.5 last:border-none">
      <span>{label}</span>
      <span className="text-muted-foreground text-sm">{linked ? 'linked' : 'not linked'}</span>
      <button
        type="button"
        className="border-border rounded-md border px-2 py-1 text-xs"
        onClick={linked ? onUnlink : onLink}
      >
        {linked ? 'Unlink' : 'Link'}
      </button>
    </div>
  );
}
