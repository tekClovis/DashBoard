import { Check, Circle, OctagonX } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useResetPassword } from '@/api/auth.js';
import { ApiError } from '@/api/client.js';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { isValidPassword, PASSWORD_RULES } from '@/lib/validation.js';
import { AuthFooter, AuthFooterLink, AuthLayout, FieldError } from './AuthLayout.js';

function LinkInvalid() {
  return (
    <AuthLayout title="Link invalid or expired">
      <Alert tone="destructive">
        <OctagonX strokeWidth={1.75} aria-hidden />
        <AlertContent>
          <AlertTitle>Link invalid or expired</AlertTitle>
          <AlertDescription>Reset links work once and for 1 hour. Request a new one to continue.</AlertDescription>
        </AlertContent>
      </Alert>
      <Button asChild>
        <Link to="/forgot-password">Request a new link</Link>
      </Button>
      <AuthFooter>
        <AuthFooterLink to="/login">Back to log in</AuthFooterLink>
      </AuthFooter>
    </AuthLayout>
  );
}

/** Sets a new password from the `token` query param; on success goes to `/login` with `state.passwordReset`. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const reset = useResetPassword();
  const navigate = useNavigate();
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const passwordBad = touched && !isValidPassword(password);
  const mismatch = touched && !passwordBad && password !== confirm;

  // A 400 means the token is unknown, used or expired: the only way forward is a new link.
  if (token === null || token === '' || (reset.error instanceof ApiError && reset.error.status === 400)) {
    return <LinkInvalid />;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const badPassword = !isValidPassword(password);
    const badConfirm = !badPassword && password !== confirm;
    setTouched(badPassword || badConfirm);
    if (badPassword) passwordRef.current?.focus();
    else if (badConfirm) confirmRef.current?.focus();
    else {
      reset.mutate(
        { token: token!, password },
        { onSuccess: () => navigate('/login', { state: { passwordReset: true } }) },
      );
    }
  }

  return (
    <AuthLayout title="Choose a new password">
      <form className="grid gap-3.5" noValidate onSubmit={onSubmit}>
        <div className="grid gap-1.5">
          <Label htmlFor="password">New password</Label>
          <ul id="password-rules" aria-label="Password requirements" className="text-muted-foreground grid gap-1 text-xs">
            {PASSWORD_RULES.map(([rule, test]) => {
              const ok = test(password);
              const Icon = ok ? Check : Circle;
              return (
                <li key={rule} data-ok={ok || undefined} className="data-ok:text-foreground flex items-center gap-1.5">
                  <Icon className="in-data-ok:text-success size-3.5" strokeWidth={1.75} aria-hidden />
                  <span>{rule}</span>
                  <span className="sr-only">{ok ? ', met' : ', not met'}</span>
                </li>
              );
            })}
          </ul>
          <Input
            id="password"
            ref={passwordRef}
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={passwordBad || undefined}
            aria-describedby={passwordBad ? 'password-rules password-err' : 'password-rules'}
          />
          {passwordBad && (
            <FieldError id="password-err">Use 8 to 72 characters with at least one digit and one symbol.</FieldError>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            ref={confirmRef}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={mismatch || undefined}
            aria-describedby={mismatch ? 'confirm-err' : undefined}
          />
          {mismatch && <FieldError id="confirm-err">The two passwords don’t match.</FieldError>}
        </div>
        {reset.isError && (
          <Alert tone="destructive">
            <OctagonX strokeWidth={1.75} aria-hidden />
            <AlertContent>
              <AlertTitle>Something went wrong. Please try again.</AlertTitle>
            </AlertContent>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={reset.isPending}>
          {reset.isPending ? 'Updating…' : 'Update password'}
        </Button>
      </form>
      <AuthFooter>
        <AuthFooterLink to="/login">Back to log in</AuthFooterLink>
      </AuthFooter>
    </AuthLayout>
  );
}
