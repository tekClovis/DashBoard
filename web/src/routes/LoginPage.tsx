import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { oauthStartUrl, useLogin } from '@/api/auth.js';
import { ApiError } from '@/api/client.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { isValidEmail } from '@/lib/validation.js';
import { AuthLayout } from './AuthLayout.js';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const canSubmit = isValidEmail(email) && password.length > 0;
  // Set by the oauth callback redirect (server/src/auth/oauth) when account-linking rule
  // 2's refusal branch fires — docs/Architecture.md §5.1 "Account linking".
  const linkRequired = searchParams.get('error') === 'EMAIL_LINK_REQUIRED';

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    login.mutate({ email, password }, { onSuccess: () => navigate('/d/placeholder') });
  }

  return (
    <AuthLayout title="Log in">
      {linkRequired && (
        <p className="text-destructive bg-destructive/10 border-destructive/30 mb-4 rounded-md border px-3 py-2 text-sm">
          You already have an account with this email. Log in with your password, then link the provider from
          Profile.
        </p>
      )}
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {login.isError && (
          <p className="text-destructive text-sm">
            {login.error instanceof ApiError && login.error.code === 'EMAIL_NOT_CONFIRMED'
              ? 'Please confirm your email before logging in.'
              : 'Invalid email or password.'}
          </p>
        )}
        <Button type="submit" disabled={!canSubmit || login.isPending}>
          {login.isPending ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <div className="mt-4 flex flex-col gap-2">
        <Button variant="outline" asChild>
          <a href={oauthStartUrl('github')}>Continue with GitHub</a>
        </Button>
        <Button variant="outline" asChild>
          <a href={oauthStartUrl('google')}>Continue with Google</a>
        </Button>
      </div>
      <p className="text-muted-foreground mt-4 text-sm">
        No account?{' '}
        <Link to="/register" className="text-primary underline underline-offset-4">
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}
