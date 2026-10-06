import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardSwitcher } from './DashboardSwitcher.js';

interface Share {
  id: string;
  dashboardName: string;
  fromEmail: string;
  widgetCount: number;
  createdAt: string;
}
let dashboards: { id: string; name: string; position: number }[];
let shares: Share[];
let calls: { url: string; method: string; body?: unknown }[];
let shareError: string | null;

beforeEach(() => {
  dashboards = [{ id: 'a', name: 'Home', position: 0 }];
  shares = [{ id: 's1', dashboardName: 'Game night', fromEmail: 'grace@example.com', widgetCount: 3, createdAt: '2026-10-05T10:00:00Z' }];
  calls = [];
  shareError = null;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
      const json = (data: unknown, status = 200) =>
        Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
      if (url === '/api/shares/incoming') return json({ shares });
      if (url.endsWith('/share')) return shareError ? json({ error: shareError }, 400) : json({ ok: true }, 201);
      if (url === '/api/shares/s1/accept') {
        shares = [];
        dashboards.push({ id: 'new', name: 'Game night', position: 1 });
        return json({ id: 'new', name: 'Game night', position: 1 }, 201);
      }
      if (url === '/api/shares/s1' && method === 'DELETE') {
        shares = [];
        return json({ ok: true });
      }
      return json({ dashboards });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Path() {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderSwitcher() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/d/a']}>
        <DashboardSwitcher />
        <Routes>
          <Route path="*" element={<Path />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openMenu() {
  fireEvent.click(await screen.findByRole('button', { name: /Switch dashboard/ }));
  return within(await screen.findByRole('dialog', { name: 'Dashboards' }));
}

describe('sharing a dashboard', () => {
  async function openShare() {
    const menu = await openMenu();
    fireEvent.click(menu.getByRole('button', { name: 'Share Home' }));
    return await screen.findByLabelText('Recipient email');
  }

  it('sends the share to the typed email and confirms', async () => {
    renderSwitcher();
    fireEvent.change(await openShare(), { target: { value: ' Ada@Example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/Sent to ada@example\.com/)).toBeTruthy();
    expect(calls).toContainEqual({ url: '/api/dashboards/a/share', method: 'POST', body: { email: 'ada@example.com' } });
  });

  it('rejects an empty email without calling the API', async () => {
    renderSwitcher();
    await openShare();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Enter an email address.')).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith('/share'))).toBe(false);
  });

  it('shows an error for an unknown user', async () => {
    shareError = 'UNKNOWN_USER';
    renderSwitcher();
    fireEvent.change(await openShare(), { target: { value: 'nobody@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/No user found for “nobody@example\.com”/)).toBeTruthy();
  });

  it('shows an error when sharing with yourself', async () => {
    shareError = 'CANNOT_SHARE_WITH_SELF';
    renderSwitcher();
    fireEvent.change(await openShare(), { target: { value: 'me@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('You can’t share a dashboard with yourself.')).toBeTruthy();
  });
});

describe('incoming shares', () => {
  async function openInbox() {
    const menu = await openMenu();
    fireEvent.click(await menu.findByRole('button', { name: /Shared with you/ }));
    return within(await screen.findByRole('dialog', { name: 'Shared with you' }));
  }

  it('shows the pending count in the menu and lists dashboard name and sender', async () => {
    renderSwitcher();
    const menu = await openMenu();
    expect((await menu.findByRole('button', { name: /Shared with you/ })).textContent).toContain('1');
    fireEvent.click(menu.getByRole('button', { name: /Shared with you/ }));
    const inbox = within(await screen.findByRole('dialog', { name: 'Shared with you' }));
    expect(inbox.getByText('Game night')).toBeTruthy();
    expect(inbox.getByText(/grace@example\.com/)).toBeTruthy();
  });

  it('adding creates the copy and opens it', async () => {
    renderSwitcher();
    const inbox = await openInbox();
    fireEvent.click(inbox.getByRole('button', { name: 'Add to my dashboards' }));
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/d/new'));
    expect(calls).toContainEqual({ url: '/api/shares/s1/accept', method: 'POST', body: undefined });
    expect(await screen.findByRole('button', { name: 'Switch dashboard, current: Game night' })).toBeTruthy();
  });

  it('declining removes the share without creating a dashboard', async () => {
    renderSwitcher();
    const inbox = await openInbox();
    fireEvent.click(inbox.getByRole('button', { name: 'Decline' }));
    expect(await screen.findByText('Nothing shared with you right now.')).toBeTruthy();
    expect(calls).toContainEqual({ url: '/api/shares/s1', method: 'DELETE', body: undefined });
    expect(calls.some((c) => c.url.endsWith('/accept'))).toBe(false);
  });

  it('shows an empty state when nothing is pending', async () => {
    shares = [];
    renderSwitcher();
    const inbox = await openInbox();
    expect(inbox.getByText('Nothing shared with you right now.')).toBeTruthy();
  });
});
