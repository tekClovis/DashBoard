import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calls, renderAt, stubAuthApi } from './auth-test-utils.js';
import { LoginPage } from './LoginPage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('LoginPage', () => {
  it('renders the branded panel with labelled fields and OAuth links', () => {
    stubAuthApi();
    renderAt('/login', '/login', <LoginPage />);
    expect(screen.getByRole('main').textContent).toContain('dashboard');
    expect(screen.getByRole('heading', { level: 1, name: 'Log in' })).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('autocomplete')).toBe('email');
    expect(screen.getByRole('link', { name: 'Continue with GitHub' }).getAttribute('href')).toBe(
      '/api/oauth/github/start?intent=login',
    );
    expect(screen.getByRole('link', { name: 'Register' }).getAttribute('href')).toBe('/register');
  });

  it('navigates home after a successful login', async () => {
    stubAuthApi();
    renderAt('/login', '/login', <LoginPage />);
    fillAndSubmit('ada@example.com', 'correct-horse-1!');
    expect(await screen.findByText('at /')).toBeTruthy();
    expect(calls[0]).toMatchObject({ url: '/api/auth/login', method: 'POST' });
  });

  it('shows wrong credentials as an alert linked to both fields', async () => {
    stubAuthApi({ '/api/auth/login': [401, { error: 'INVALID_CREDENTIALS' }] });
    renderAt('/login', '/login', <LoginPage />);
    fillAndSubmit('ada@example.com', 'wrong-pw-1!');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Email or password is incorrect');
    for (const label of ['Email', 'Password']) {
      const input = screen.getByLabelText(label);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    }
    expect(document.activeElement).toBe(screen.getByLabelText('Password'));
  });

  it('shows the error alert without calling the API when the input is invalid', () => {
    stubAuthApi();
    renderAt('/login', '/login', <LoginPage />);
    fillAndSubmit('ada@example', '');
    expect(screen.getByRole('alert').textContent).toContain('Email or password is incorrect');
    expect(calls).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByLabelText('Email'));
  });

  it('offers a new confirmation link when the email is not confirmed', async () => {
    stubAuthApi({ '/api/auth/login': [403, { error: 'EMAIL_NOT_CONFIRMED' }] });
    renderAt('/login', '/login', <LoginPage />);
    fillAndSubmit('unconfirmed@example.com', 'correct-horse-1!');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Confirm your email first');
    expect(alert.textContent).toContain('Open the link we sent to unconfirmed@example.com.');
    expect(document.activeElement).toBe(screen.getByLabelText('Password'));

    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByText('If that account needs a new link, it’s on its way.')).toBeTruthy();
    expect(calls.at(-1)).toMatchObject({
      url: '/api/auth/resend',
      method: 'POST',
      body: { email: 'unconfirmed@example.com' },
    });
    expect(screen.queryByRole('button', { name: 'Send a new link' })).toBeNull();
  });

  it('prefills the email carried over from register', () => {
    stubAuthApi();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { email: 'ada@example.com' } }]}>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('ada@example.com');
  });

  it('links to /forgot-password', () => {
    stubAuthApi();
    renderAt('/login', '/login', <LoginPage />);
    expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe('/forgot-password');
  });

  it('confirms a completed password reset', () => {
    stubAuthApi();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { passwordReset: true } }]}>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('status').textContent).toContain('Password updated');
  });

  it('confirms an account deletion carried in the location state', () => {
    stubAuthApi();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { accountDeleted: true } }]}>
          <LoginPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const notice = screen.getByRole('status');
    expect(notice.dataset.tone).toBe('success');
    expect(notice.textContent).toContain('Your account was deleted');
  });

  it('shows no deletion notice on a plain visit', () => {
    stubAuthApi();
    renderAt('/login', '/login', <LoginPage />);
    expect(screen.queryByText('Your account was deleted')).toBeNull();
  });

  it('explains the account-linking refusal from the OAuth callback', () => {
    stubAuthApi();
    renderAt('/login?error=EMAIL_LINK_REQUIRED', '/login', <LoginPage />);
    const notice = screen.getByRole('status');
    expect(notice.dataset.tone).toBe('warning');
    expect(notice.textContent).toContain('This email already has an account');
  });

  it('explains that OAuth cannot create an account', () => {
    stubAuthApi();
    renderAt('/login?error=OAUTH_NO_ACCOUNT', '/login', <LoginPage />);
    const notice = screen.getByRole('status');
    expect(notice.dataset.tone).toBe('warning');
    expect(notice.textContent).toContain('No account for this provider');
  });
});
