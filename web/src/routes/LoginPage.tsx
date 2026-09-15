import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLogin } from '@/api/auth.js';
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

  const canSubmit = isValidEmail(email) && password.length > 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    login.mutate({ email, password }, { onSuccess: () => navigate('/d/placeholder') });
  }

  return (
    <AuthLayout title="Log in">
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
      <p className="text-muted-foreground mt-4 text-sm">
        No account?{' '}
        <Link to="/register" className="text-primary underline underline-offset-4">
          Register
        </Link>
      </p>
    </AuthLayout>
  );
}
