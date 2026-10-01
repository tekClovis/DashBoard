import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calls, renderAt, stubAuthApi } from './auth-test-utils.js';
import { ConfirmPage } from './ConfirmPage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ConfirmPage', () => {
  it('shows the confirmed state with a primary log-in link', async () => {
    stubAuthApi();
    renderAt('/confirm?token=abc', '/confirm', <ConfirmPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Confirming your email' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 1, name: 'Email confirmed' })).toBeTruthy();
    expect(screen.getByText('Your account is active.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login');
    expect(calls[0]?.url).toBe('/api/auth/confirm?token=abc');
  });

  it('shows the expired state and resends a link to a valid email', async () => {
    stubAuthApi({ '/api/auth/confirm': [400, { error: 'INVALID_TOKEN' }] });
    renderAt('/confirm?token=old', '/confirm', <ConfirmPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Link expired' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('This link is invalid or has expired');

    const email = screen.getByLabelText('Email');
    fireEvent.change(email, { target: { value: 'ada@example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(email.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Enter an email like name@example.com.',
    );
    expect(calls).toHaveLength(1);
    expect(document.activeElement).toBe(email);

    fireEvent.change(email, { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByText('If that account needs a new link, it’s on its way.')).toBeTruthy();
    expect(calls.at(-1)).toMatchObject({ url: '/api/auth/resend', body: { email: 'ada@example.com' } });
  });

  it('asks for the emailed link when no token is given', () => {
    stubAuthApi();
    renderAt('/confirm', '/confirm', <ConfirmPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Link missing' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('This page needs the link from your email');
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(calls).toHaveLength(0);
  });
});
