import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calls, renderAt, stubAuthApi } from './auth-test-utils.js';
import { ForgotPasswordPage } from './ForgotPasswordPage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function submit(email: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
}

describe('ForgotPasswordPage', () => {
  it('posts the email and shows the neutral confirmation', async () => {
    stubAuthApi();
    renderAt('/forgot-password', '/forgot-password', <ForgotPasswordPage />);
    submit('ada@example.com');

    expect(await screen.findByText('If an account exists, we sent a link')).toBeTruthy();
    expect(calls[0]).toMatchObject({ url: '/api/auth/forgot-password', method: 'POST', body: { email: 'ada@example.com' } });
    expect(screen.getByRole('link', { name: 'Back to log in' }).getAttribute('href')).toBe('/login');
  });

  it('shows the same message when the server rate-limits silently (still 200)', async () => {
    stubAuthApi({ '/api/auth/forgot-password': [200, { ok: true }] });
    renderAt('/forgot-password', '/forgot-password', <ForgotPasswordPage />);
    submit('nobody@example.com');
    expect(await screen.findByText('If an account exists, we sent a link')).toBeTruthy();
  });

  it('shows an inline error and makes no request for an invalid email', () => {
    stubAuthApi();
    renderAt('/forgot-password', '/forgot-password', <ForgotPasswordPage />);
    submit('ada@example');

    expect(screen.getByText('Enter an email like name@example.com.')).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe('true');
    expect(calls).toHaveLength(0);
  });

  it('lets the user go back to the form with another email', async () => {
    stubAuthApi();
    renderAt('/forgot-password', '/forgot-password', <ForgotPasswordPage />);
    submit('ada@example.com');
    fireEvent.click(await screen.findByRole('button', { name: 'Use another email' }));
    expect(await screen.findByRole('button', { name: 'Send reset link' })).toBeTruthy();
  });
});
