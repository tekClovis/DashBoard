import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { calls, renderAt, stubAuthApi } from './auth-test-utils.js';
import { LoginPage } from './LoginPage.js';
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
    expect(document.activeElement).toBe(email);
  });

  it('focuses the password when only the password is invalid', () => {
    stubAuthApi();
    renderAt('/register', '/register', <RegisterPage />);
    type('Email', 'ada@example.com');
    type('Password', 'telemetry1');
    submit();
    expect(document.activeElement).toBe(screen.getByLabelText('Password'));
  });

  it('shows email-in-use as a destructive alert with a way to log in', async () => {
    stubAuthApi({ '/api/auth/register': [409, { error: 'EMAIL_IN_USE' }] });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/register']}>
          <Routes>
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    type('Email', 'ada@example.com');
    type('Password', 'correct-horse-1!');
    type('Confirm your password', 'correct-horse-1!');
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert.dataset.tone).toBe('destructive');
    expect(alert.textContent).toContain('That email is already registered');
    expect(within(alert).getByRole('link', { name: 'Log in instead' }).getAttribute('href')).toBe('/login');
    expect(screen.getByLabelText('Email').getAttribute('aria-describedby')).toBe(alert.id);

    fireEvent.click(within(alert).getByRole('link', { name: 'Log in instead' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Log in' })).toBeTruthy();
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('ada@example.com');
  });

  it('shows the sent state after registering and can resend the link once', async () => {
    stubAuthApi();
    renderAt('/register', '/register', <RegisterPage />);
    type('Email', 'grace@example.com');
    type('Password', 'correct-horse-1!');
    type('Confirm your password', 'correct-horse-1!');
    submit();

    expect(await screen.findByRole('heading', { level: 1, name: 'Check your email' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('main'));
    expect(screen.getByText('grace@example.com').tagName).toBe('B');
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login');

    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByText('If that account needs a new link, it’s on its way.')).toBeTruthy();
    expect(calls.at(-1)).toMatchObject({ url: '/api/auth/resend', body: { email: 'grace@example.com' } });
    expect((screen.getByRole('button', { name: 'Send a new link' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('has a new-password confirm field directly under the password field', () => {
    stubAuthApi();
    renderAt('/register', '/register', <RegisterPage />);
    const confirm = screen.getByLabelText('Confirm your password') as HTMLInputElement;
    expect(confirm.type).toBe('password');
    expect(confirm.autocomplete).toBe('new-password');
    const pw = screen.getByLabelText('Password');
    expect(pw.parentElement?.nextElementSibling).toBe(confirm.parentElement);
  });

  it.each([
    ['differs', 'correct-horse-2!'],
    ['is empty', ''],
  ])('blocks submit and focuses the confirm field when it %s', (_name, value) => {
    stubAuthApi();
    renderAt('/register', '/register', <RegisterPage />);
    type('Email', 'ada@example.com');
    type('Password', 'correct-horse-1!');
    type('Confirm your password', value);
    submit();

    const confirm = screen.getByLabelText('Confirm your password');
    expect(confirm.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(confirm.getAttribute('aria-describedby')!)?.textContent).toBe(
      'Passwords do not match.',
    );
    expect(document.activeElement).toBe(confirm);
    expect(calls).toHaveLength(0);
  });

  it('registers with only email and password when the passwords match', async () => {
    stubAuthApi();
    renderAt('/register', '/register', <RegisterPage />);
    type('Email', 'ada@example.com');
    type('Password', 'correct-horse-1!');
    type('Confirm your password', 'correct-horse-1!');
    submit();
    await screen.findByRole('heading', { level: 1, name: 'Check your email' });
    expect(calls.at(-1)).toMatchObject({
      url: '/api/auth/register',
      body: { email: 'ada@example.com', password: 'correct-horse-1!' },
    });
    expect(Object.keys(calls.at(-1)!.body as object).sort()).toEqual(['email', 'password']);
  });
});
