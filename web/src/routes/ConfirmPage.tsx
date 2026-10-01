import { OctagonX } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useConfirm, useResend } from '@/api/auth.js';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { isValidEmail } from '@/lib/validation.js';
import { AuthLayout, FieldError, ResentNotice } from './AuthLayout.js';

function ResendForm() {
  const resend = useResend();
  const [email, setEmail] = useState('');
  const [invalid, setInvalid] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  if (resend.isSuccess) return <ResentNotice />;

  return (
    <form
      className="grid gap-2.5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const valid = isValidEmail(email);
        setInvalid(!valid);
        if (valid) resend.mutate({ email });
        else emailRef.current?.focus();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="resend-email">Email</Label>
        <Input
          id="resend-email"
          ref={emailRef}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'resend-email-err' : undefined}
        />
        {invalid && <FieldError id="resend-email-err">Enter an email like name@example.com.</FieldError>}
      </div>
      <Button type="submit" variant="outline" disabled={resend.isPending}>
        Send a new link
      </Button>
    </form>
  );
}

function LinkProblem({ title, alertTitle, description }: { title: string; alertTitle: string; description: string }) {
  return (
    <AuthLayout title={title}>
      <Alert tone="destructive">
        <OctagonX strokeWidth={1.75} aria-hidden />
        <AlertContent>
          <AlertTitle>{alertTitle}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </AlertContent>
      </Alert>
      <ResendForm />
    </AuthLayout>
  );
}

export function ConfirmPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const confirm = useConfirm(token);

  if (token === null) {
    return (
      <LinkProblem
        title="Link missing"
        alertTitle="This page needs the link from your email"
        description="Open the confirmation email and use its link, or request a new one."
      />
    );
  }
  if (confirm.isError) {
    return (
      <LinkProblem
        title="Link expired"
        alertTitle="This link is invalid or has expired"
        description="Request a new one below."
      />
    );
  }
  if (confirm.isSuccess) {
    return (
      <AuthLayout title="Email confirmed">
        <p className="text-muted-foreground">Your account is active.</p>
        <Button asChild>
          <Link to="/login">Log in</Link>
        </Button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Confirming your email">
      <p className="text-muted-foreground" role="status">
        This takes a second.
      </p>
      <Skeleton className="h-8" />
    </AuthLayout>
  );
}
