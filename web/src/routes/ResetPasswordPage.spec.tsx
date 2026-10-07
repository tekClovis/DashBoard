import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calls, renderAt, stubAuthApi } from './auth-test-utils.js';
import { ResetPasswordPage } from './ResetPasswordPage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function submit(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
}

const render = () => renderAt('/reset-password?token=abc', '/reset-password', <ResetPasswordPage />);

describe('ResetPasswordPage', () => {
  it('posts the token and password, then lands on login', async () => {
    stubAuthApi();
    render();
    submit('brand-new-pw-2@', 'brand-new-pw-2@');

    expect(await screen.findByText('at /login')).toBeTruthy();
    expect(calls[0]).toMatchObject({
      url: '/api/auth/reset-password',
      method: 'POST',
      body: { token: 'abc', password: 'brand-new-pw-2@' },
    });
  });

  it('shows an inline error and makes no request for a password failing the pattern', () => {
    stubAuthApi();
    render();
    submit('telemetry', 'telemetry');

    expect(screen.getByText(/Use 8 to 72 characters/)).toBeTruthy();
    expect(screen.getByLabelText('New password').getAttribute('aria-invalid')).toBe('true');
    expect(calls).toHaveLength(0);
  });

  it('shows an inline error and makes no request when the confirmation differs', () => {
    stubAuthApi();
    render();
    submit('telemetry1!', 'telemetry2!');

    expect(screen.getByText('The two passwords don’t match.')).toBeTruthy();
    expect(screen.getByLabelText('Confirm new password').getAttribute('aria-invalid')).toBe('true');
    expect(calls).toHaveLength(0);
  });

  it('shows "Link invalid or expired" when the server rejects the token', async () => {
    stubAuthApi({ '/api/auth/reset-password': [400, { error: 'INVALID_TOKEN' }] });
    render();
    submit('brand-new-pw-2@', 'brand-new-pw-2@');

    expect(await screen.findByRole('heading', { level: 1, name: 'Link invalid or expired' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Request a new link' }).getAttribute('href')).toBe('/forgot-password');
  });

  it('shows the invalid-link state straight away when the URL has no token', () => {
    stubAuthApi();
    renderAt('/reset-password', '/reset-password', <ResetPasswordPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Link invalid or expired' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Request a new link' }).getAttribute('href')).toBe('/forgot-password');
    expect(calls).toHaveLength(0);
  });
});
