import { useState } from 'react';
import { Link } from 'react-router';
import { useRegister } from '@/api/auth.js';
import { ApiError } from '@/api/client.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { isValidEmail, isValidPassword } from '@/lib/validation.js';
import { AuthLayout } from './AuthLayout.js';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const register = useRegister();

  const canSubmit = isValidEmail(email) && isValidPassword(password);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    register.mutate({ email, password });
  }

  if (register.isSuccess) {
    return (
      <AuthLayout title="Check your email">
        <p className="text-muted-foreground text-sm">
          We sent a confirmation link to {email}. Follow it to activate your account.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Register">
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            8-72 characters, at least one digit and one symbol.
          </p>
        </div>
        {register.isError && (
          <p className="text-destructive text-sm">
            {register.error instanceof ApiError && register.error.code === 'EMAIL_IN_USE'
              ? 'That email is already registered.'
              : 'Something went wrong. Please try again.'}
          </p>
        )}
        <Button type="submit" disabled={!canSubmit || register.isPending}>
          {register.isPending ? 'Creating account…' : 'Register'}
        </Button>
      </form>
      <p className="text-muted-foreground mt-4 text-sm">
        Already have an account?{' '}
        <Link to="/login" className="text-primary underline underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
