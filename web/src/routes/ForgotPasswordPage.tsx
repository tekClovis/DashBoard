import { Mail } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForgotPassword } from '@/api/auth.js';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { isValidEmail } from '@/lib/validation.js';
import { AuthFooter, AuthFooterLink, AuthLayout, FieldError } from './AuthLayout.js';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState(false);
  const forgot = useForgotPassword();
  const emailRef = useRef<HTMLInputElement>(null);
  const sent = forgot.isSuccess;

  useEffect(() => {
    if (sent) document.getElementById('main')?.focus();
  }, [sent]);

  if (sent) {
    return (
      <AuthLayout title="Check your email">
        <Alert>
          <Mail strokeWidth={1.75} aria-hidden />
          <AlertContent>
            <AlertTitle>If an account exists, we sent a link</AlertTitle>
            <AlertDescription>
              If <b className="text-foreground font-[550]">{email}</b> belongs to an account with a password, a reset
              link is on its way. It works for 1 hour and only once.
            </AlertDescription>
          </AlertContent>
        </Alert>
        <p className="text-muted-foreground text-[0.8125rem]">
          Nothing after a few minutes? Check spam, or try again in a minute.
        </p>
        <Button type="button" variant="outline" className="w-full" onClick={() => {
            forgot.reset();
            setEmail('');
            setInvalid(false);
          }}>
          Use another email
        </Button>
        <AuthFooter>
          <AuthFooterLink to="/login">Back to log in</AuthFooterLink>
        </AuthFooter>
      </AuthLayout>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valid = isValidEmail(email);
    setInvalid(!valid);
    if (valid) forgot.mutate({ email });
    else emailRef.current?.focus();
  }

  return (
    <AuthLayout title="Forgot your password?">
      <p className="text-muted-foreground text-[0.8125rem]">
        Enter your account email and we will send you a link to choose a new password.
      </p>
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
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? 'email-err' : undefined}
          />
          {invalid && <FieldError id="email-err">Enter an email like name@example.com.</FieldError>}
        </div>
        <Button type="submit" className="w-full" disabled={forgot.isPending}>
          {forgot.isPending ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <AuthFooter>
        <AuthFooterLink to="/login">Back to log in</AuthFooterLink>
      </AuthFooter>
    </AuthLayout>
  );
}
