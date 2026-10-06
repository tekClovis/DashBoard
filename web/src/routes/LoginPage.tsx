import { Check, Mail, OctagonX, TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { oauthStartUrl, useLogin, useResend } from '@/api/auth.js';
import { ApiError } from '@/api/client.js';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { isValidEmail } from '@/lib/validation.js';
import { AuthFooter, AuthFooterLink, AuthLayout, RESENT_MESSAGE } from './AuthLayout.js';

export function LoginPage() {
  // "Log in instead" on register carries the typed email over in the location state.
  const carried: unknown = useLocation().state;
  const [email, setEmail] = useState(() =>
    carried && typeof carried === 'object' && 'email' in carried && typeof carried.email === 'string'
      ? carried.email
      : '',
  );
  const passwordReset =
    typeof carried === 'object' && carried !== null && 'passwordReset' in carried && carried.passwordReset === true;
  const [password, setPassword] = useState('');
  const [invalidInput, setInvalidInput] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const login = useLogin();
  const resend = useResend();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Set by the oauth callback redirect (server/src/auth/oauth) when account-linking rule
  // 2's refusal branch fires — docs/Architecture.md §5.1 "Account linking".
  const linkRequired = searchParams.get('error') === 'EMAIL_LINK_REQUIRED';
  // Rule 3: OAuth never creates an account.
  const noAccount = searchParams.get('error') === 'OAUTH_NO_ACCOUNT';
  const unconfirmed = login.error instanceof ApiError && login.error.code === 'EMAIL_NOT_CONFIRMED';
  const wrongCredentials = invalidInput || (login.isError && !unconfirmed);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valid = isValidEmail(email) && password.length > 0;
    setInvalidInput(!valid);
    if (!valid) {
      login.reset();
      emailRef.current?.focus();
      return;
    }
    resend.reset();
    login.mutate(
      { email, password },
      { onSuccess: () => navigate('/'), onError: () => passwordRef.current?.focus() },
    );
  }

  const errorProps = wrongCredentials ? { 'aria-invalid': true, 'aria-describedby': 'login-err' } : {};

  return (
    <AuthLayout title="Log in">
      {passwordReset && (
        <Alert tone="success" role="status">
          <Check strokeWidth={1.75} aria-hidden />
          <AlertContent>
            <AlertTitle>Password updated</AlertTitle>
            <AlertDescription>Log in with your new password. Any other device was logged out.</AlertDescription>
          </AlertContent>
        </Alert>
      )}
      {linkRequired && (
        <Alert tone="warning">
          <TriangleAlert strokeWidth={1.75} aria-hidden />
          <AlertContent>
            <AlertTitle>This email already has an account</AlertTitle>
            <AlertDescription>Log in with your password, then link the provider from Profile.</AlertDescription>
          </AlertContent>
        </Alert>
      )}
      {noAccount && (
        <Alert tone="warning">
          <TriangleAlert strokeWidth={1.75} aria-hidden />
          <AlertContent>
            <AlertTitle>No account for this provider</AlertTitle>
            <AlertDescription>Register with your email first, then link the provider from Profile.</AlertDescription>
          </AlertContent>
        </Alert>
      )}
      <form className="grid gap-3.5" noValidate onSubmit={onSubmit}>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            {...errorProps}
          />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs underline underline-offset-3">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            ref={passwordRef}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            {...errorProps}
          />
        </div>
        {wrongCredentials && (
          <Alert tone="destructive" id="login-err">
            <OctagonX strokeWidth={1.75} aria-hidden />
            <AlertContent>
              <AlertTitle>Email or password is incorrect</AlertTitle>
            </AlertContent>
          </Alert>
        )}
        {unconfirmed && (
          <Alert tone="warning" role="alert">
            <Mail strokeWidth={1.75} aria-hidden />
            <AlertContent>
              <AlertTitle>Confirm your email first</AlertTitle>
              <AlertDescription>Open the link we sent to {email}.</AlertDescription>
              {resend.isSuccess ? (
                <AlertDescription role="status">{RESENT_MESSAGE}</AlertDescription>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  className="mt-1 justify-self-start"
                  disabled={resend.isPending}
                  onClick={() => resend.mutate({ email })}
                >
                  Send a new link
                </Button>
              )}
            </AlertContent>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <div className="text-muted-foreground before:bg-border after:bg-border flex items-center gap-2.5 text-xs before:h-px before:flex-1 after:h-px after:flex-1">
        or
      </div>
      <div className="grid gap-2">
        <Button variant="outline" asChild>
          <a href={oauthStartUrl('github')}>Continue with GitHub</a>
        </Button>
        <Button variant="outline" asChild>
          <a href={oauthStartUrl('google')}>Continue with Google</a>
        </Button>
      </div>
      <AuthFooter>
        No account? <AuthFooterLink to="/register">Register</AuthFooterLink>
      </AuthFooter>
    </AuthLayout>
  );
}
