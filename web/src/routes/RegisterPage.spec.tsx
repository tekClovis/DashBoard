import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calls, renderAt, stubAuthApi } from './auth-test-utils.js';
import { RegisterPage } from './RegisterPage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

describe('RegisterPage', () => {
  it('ticks each password rule as the user types', () => {
    stubAuthApi();
    renderAt('/register', '/register', <RegisterPage />);
    const rules = screen.getByRole('list', { name: 'Password requirements' });
    const met = () => within(rules).getAllByRole('listitem').filter((li) => li.hasAttribute('data-ok')).length;
    expect(met()).toBe(0);
    expect(screen.getByLabelText('Password').getAttribute('aria-describedby')).toBe(rules.id);

    type('Password', 'telemetry1');
    expect(met()).toBe(2);
    expect(rules.textContent).toContain('At least one symbol, not met');

    type('Password', 'telemetry1!');
    expect(met()).toBe(3);
  });

  it('shows field errors linked to the inputs and sends nothing for invalid input', () => {
    stubAuthApi();
    renderAt('/register', '/register', <RegisterPage />);
    type('Email', 'ada@example');
    type('Password', 'telemetry1');
    submit();

    const email = screen.getByLabelText('Email');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    const emailErr = document.getElementById(email.getAttribute('aria-describedby')!);
    expect(emailErr?.textContent).toBe('Enter an email like name@example.com.');

    const pw = screen.getByLabelText('Password');
    expect(pw.getAttribute('aria-invalid')).toBe('true');
    const [, pwErrId] = pw.getAttribute('aria-describedby')!.split(' ');
    expect(document.getElementById(pwErrId!)?.textContent).toBe('Meet every rule above.');
    expect(calls).toHaveLength(0);
  });

  it('shows email-in-use as a destructive alert with a way to log in', async () => {
    stubAuthApi({ '/api/auth/register': [409, { error: 'EMAIL_IN_USE' }] });
    renderAt('/register', '/register', <RegisterPage />);
    type('Email', 'ada@example.com');
    type('Password', 'correct-horse-1!');
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.dataset.tone).toBe('destructive');
    expect(alert.textContent).toContain('That email is already registered');
    expect(within(alert).getByRole('link', { name: 'Log in instead' }).getAttribute('href')).toBe('/login');
    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('shows the sent state after registering and can resend the link once', async () => {
    stubAuthApi();
    renderAt('/register', '/register', <RegisterPage />);
    type('Email', 'grace@example.com');
    type('Password', 'correct-horse-1!');
    submit();

    expect(await screen.findByRole('heading', { level: 1, name: 'Check your email' })).toBeTruthy();
    expect(screen.getByText('grace@example.com').tagName).toBe('B');
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login');

    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByText('If that account needs a new link, it’s on its way.')).toBeTruthy();
    expect(calls.at(-1)).toMatchObject({ url: '/api/auth/resend', body: { email: 'grace@example.com' } });
    expect((screen.getByRole('button', { name: 'Send a new link' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
