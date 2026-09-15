import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useConfirm, useResend } from '@/api/auth.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { isValidEmail } from '@/lib/validation.js';
import { AuthLayout } from './AuthLayout.js';

export function ConfirmPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const confirm = useConfirm(token);
  const resend = useResend();
  const [resendEmail, setResendEmail] = useState('');

  return (
    <AuthLayout title="Confirm your email">
      {token === null && <p className="text-destructive text-sm">No confirmation token provided.</p>}
      {confirm.isPending && token !== null && (
        <p className="text-muted-foreground text-sm">Confirming…</p>
      )}
      {confirm.isSuccess && (
        <p className="text-sm">
          Your email is confirmed. You can now{' '}
          <Link to="/login" className="text-primary underline underline-offset-4">
            log in
          </Link>
          .
        </p>
      )}
      {confirm.isError && (
        <div className="flex flex-col gap-3">
          <p className="text-destructive text-sm">This link is invalid or has expired.</p>
          {resend.isSuccess ? (
            <p className="text-muted-foreground text-sm">
              If that account needs a new link, we've sent one.
            </p>
          ) : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (isValidEmail(resendEmail)) resend.mutate({ email: resendEmail });
              }}
            >
              <Label htmlFor="resend-email">Resend to</Label>
              <Input
                id="resend-email"
                type="email"
                autoComplete="email"
                value={resendEmail}
                onChange={(e) => setResendEmail(e.target.value)}
              />
              <Button type="submit" variant="outline" disabled={!isValidEmail(resendEmail) || resend.isPending}>
                {resend.isPending ? 'Sending…' : 'Resend confirmation link'}
              </Button>
            </form>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
