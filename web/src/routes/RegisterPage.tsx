import { Check, Circle, Mail, OctagonX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useRegister, useResend } from '@/api/auth.js';
import { ApiError } from '@/api/client.js';
import { Alert, AlertContent, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { isValidEmail, isValidPassword, PASSWORD_RULES } from '@/lib/validation.js';
import { AuthFooter, AuthFooterLink, AuthLayout, FieldError, ResentNotice } from './AuthLayout.js';

function SentState({ email }: { email: string }) {
  const resend = useResend();
  useEffect(() => document.getElementById('main')?.focus(), []);
  return (
    <AuthLayout title="Check your email">
      <p className="text-muted-foreground">
        We sent a confirmation link to <b className="text-foreground font-[550]">{email}</b>. Open it to activate
        your account.
      </p>
      {resend.isSuccess ? (
        <ResentNotice />
      ) : (
        <Alert>
          <Mail strokeWidth={1.75} aria-hidden />
          <AlertContent>Nothing after a few minutes? Check spam, or send it again.</AlertContent>
        </Alert>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={resend.isSuccess || resend.isPending}
        onClick={() => resend.mutate({ email })}
      >
        Send a new link
      </Button>
      <AuthFooter>
        Already confirmed? <AuthFooterLink to="/login">Log in</AuthFooterLink>
      </AuthFooter>
    </AuthLayout>
  );
}

/** Account creation form; on success shows a "check your email" view instead of logging in. */
export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const register = useRegister();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const emailBad = touched && !isValidEmail(email);
  const passwordBad = touched && !isValidPassword(password);
  const mismatch = touched && !emailBad && !passwordBad && password !== confirm;
  const emailInUse = register.error instanceof ApiError && register.error.code === 'EMAIL_IN_USE';

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const badPassword = !isValidPassword(password);
    const badConfirm = !badPassword && password !== confirm;
    const valid = isValidEmail(email) && !badPassword && !badConfirm;
    setTouched(!valid);
    if (valid) register.mutate({ email, password });
    else if (!isValidEmail(email)) emailRef.current?.focus();
    else (badPassword ? passwordRef : confirmRef).current?.focus();
  }

  if (register.isSuccess) return <SentState email={email} />;

  return (
    <AuthLayout title="Create an account">
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
            aria-invalid={emailBad || undefined}
            aria-describedby={emailBad ? 'email-err' : emailInUse ? 'register-err' : undefined}
          />
          {emailBad && <FieldError id="email-err">Enter an email like name@example.com.</FieldError>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
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
          {passwordBad && <FieldError id="password-err">Meet every rule above.</FieldError>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm">Confirm your password</Label>
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
          {mismatch && <FieldError id="confirm-err">Passwords do not match.</FieldError>}
        </div>
        {register.isError && (
          <Alert tone="destructive" id="register-err">
            <OctagonX strokeWidth={1.75} aria-hidden />
            <AlertContent>
              {emailInUse ? (
                <>
                  <AlertTitle>That email is already registered</AlertTitle>
                  <Button variant="link" className="mt-1 justify-self-start" asChild>
                    <Link to="/login" state={{ email }}>
                      Log in instead
                    </Link>
                  </Button>
                </>
              ) : (
                <AlertTitle>Something went wrong. Please try again.</AlertTitle>
              )}
            </AlertContent>
          </Alert>
        )}
        <Button type="submit" className="w-full" disabled={register.isPending}>
          {register.isPending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <AuthFooter>
        Already have an account? <AuthFooterLink to="/login">Log in</AuthFooterLink>
      </AuthFooter>
    </AuthLayout>
  );
}
