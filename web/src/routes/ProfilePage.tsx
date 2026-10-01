import { LogOut, TriangleAlert } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { oauthStartUrl, useLogout, useLogoutAll, useMe, useUnlinkIdentity, type OAuthProvider } from '@/api/auth.js';
import { ApiError } from '@/api/client.js';
import { PageHead } from '@/components/page-head.js';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Lamp } from '@/components/ui/lamp.js';

interface Toast {
  title: string;
  body?: string;
}

/** 160px label column on desktop; at 375 the value drops under the label and the action sits on the right. */
const kvClass =
  'grid min-h-12 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t px-4 py-2.5 text-[0.8125rem] first:border-t-0 md:grid-cols-[160px_1fr_auto] max-md:[&>:nth-child(2)]:col-start-1 max-md:[&>:nth-child(2)]:row-start-2 max-md:[&>:nth-child(3)]:col-start-2 max-md:[&>:nth-child(3)]:row-span-2 max-md:[&>:nth-child(3)]:row-start-1';

/** Matches mocks/index.html#screen=profile: Account, Sign-in methods and Sessions cards. */
export function ProfilePage() {
  const { data: me } = useMe();
  const unlink = useUnlinkIdentity();
  const logout = useLogout();
  const logoutAll = useLogoutAll();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [toast, setToast] = useState<Toast | null>(
    // Set by the oauth `link` callback redirect when the completed handshake's provider
    // identity is already linked to a different user (server/src/auth/oauth).
    searchParams.get('error') === 'IDENTITY_ALREADY_LINKED'
      ? {
          title: 'That account belongs to another user',
          body: 'It’s already linked to a different account here. Sign in with it there and unlink it first, or use another account.',
        }
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
          setToast({ title: "Can't unlink your only remaining login method." });
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
    <div className="mx-auto grid max-w-[640px] gap-4">
      <PageHead className="mb-0" title="Profile" sub="Your account and how you sign in." />

      <ProfileCard title="Account">
        <dl>
          <div className={kvClass}>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="min-w-0 break-words">{me.email}</dd>
          </div>
          <div className={kvClass}>
            <dt className="text-muted-foreground">Role</dt>
            <dd>
              <Badge className="font-mono">{me.role}</Badge>
            </dd>
          </div>
          <div className={kvClass}>
            <dt className="text-muted-foreground">Email confirmed</dt>
            <dd>
              {me.emailVerifiedAt ? (
                <time className="font-mono text-xs" dateTime={me.emailVerifiedAt}>
                  {me.emailVerifiedAt.slice(0, 10)}
                </time>
              ) : (
                <Badge>
                  <Lamp state="off" />
                  Not confirmed
                </Badge>
              )}
            </dd>
          </div>
        </dl>
      </ProfileCard>

      <ProfileCard title="Sign-in methods">
        <div className={kvClass}>
          <span className="text-muted-foreground">Password</span>
          <span>
            <StateBadge on={me.hasPassword} onLabel="Set" offLabel="Not set" />
          </span>
        </div>
        <IdentityRow
          label="GitHub"
          linked={linked.has('GITHUB')}
          sole={soleLoginMethod}
          onLink={() => handleLink('github')}
          onUnlink={() => handleUnlink('github')}
        />
        <IdentityRow
          label="Google"
          linked={linked.has('GOOGLE')}
          sole={soleLoginMethod}
          onLink={() => handleLink('google')}
          onUnlink={() => handleUnlink('google')}
        />
        {toast && (
          <Alert tone="warning" className="mx-4 mb-4">
            <TriangleAlert strokeWidth={1.75} aria-hidden />
            <AlertContent>
              <AlertTitle>{toast.title}</AlertTitle>
              {toast.body && <AlertDescription>{toast.body}</AlertDescription>}
            </AlertContent>
          </Alert>
        )}
      </ProfileCard>

      <ProfileCard title="Sessions">
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={logout.isPending} onClick={onLogout}>
            <LogOut strokeWidth={1.75} aria-hidden />
            Log out
          </Button>
          <Button variant="outline" disabled={logoutAll.isPending} onClick={onLogoutAll}>
            Log out of all devices
          </Button>
          <p className="text-muted-foreground basis-full text-xs">“All devices” ends every session, including this one.</p>
        </CardContent>
      </ProfileCard>
    </div>
  );
}

function ProfileCard({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>{title}</CardTitle>
      </CardHeader>
      {children}
    </Card>
  );
}

function StateBadge({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return on ? (
    <Badge variant="success">
      <Lamp state="live" />
      {onLabel}
    </Badge>
  ) : (
    <Badge>
      <Lamp state="off" />
      {offLabel}
    </Badge>
  );
}

function IdentityRow({
  label,
  linked,
  sole,
  onLink,
  onUnlink,
}: {
  label: string;
  linked: boolean;
  sole: boolean;
  onLink: () => void;
  onUnlink: () => void;
}) {
  return (
    <div className={kvClass}>
      <span className="text-muted-foreground">{label}</span>
      <span>
        <StateBadge on={linked} onLabel="Linked" offLabel="Not linked" />
      </span>
      {linked && sole ? (
        <span className="text-muted-foreground text-xs">Only sign-in method</span>
      ) : linked ? (
        <Button variant="outline" size="sm" onClick={onUnlink}>
          Unlink
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={onLink}>
          Link {label}
        </Button>
      )}
    </div>
  );
}
