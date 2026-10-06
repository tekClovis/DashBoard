import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxButton, ShareButton } from './DashboardShare.js';

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
let sent: { id: string; toEmail: string; status: string }[];
let shareError: string | null;
let acceptStatus: number;

beforeEach(() => {
  dashboards = [{ id: 'a', name: 'Home', position: 0 }];
  shares = [{ id: 's1', dashboardName: 'Game night', fromEmail: 'grace@example.com', widgetCount: 3, createdAt: '2026-10-05T10:00:00Z' }];
  calls = [];
  shareError = null;
  sent = [{ id: 'x1', toEmail: 'lin@example.com', status: 'PENDING' }];
  acceptStatus = 201;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
      const json = (data: unknown, status = 200) =>
        Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
      if (url === '/api/shares/incoming') return json({ shares });
      if (url === '/api/dashboards/a/shares') return json({ shares: sent });
      if (url.endsWith('/share')) return shareError ? json({ error: shareError }, shareError === 'ALREADY_SHARED' ? 409 : 400) : json({ ok: true }, 201);
      if (url === '/api/shares/s1/accept') {
        if (acceptStatus === 404) {
          shares = [];
          return json({}, 404);
        }
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
        <ShareButton dashboardId="a" />
        <InboxButton />
        <Routes>
          <Route path="*" element={<Path />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('sharing a dashboard', () => {
  async function openShare() {
    const button = await screen.findByRole('button', { name: 'Share' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    return await screen.findByLabelText('Recipient email');
  }

  it('sends the share to the typed email and confirms', async () => {
    renderSwitcher();
    fireEvent.change(await openShare(), { target: { value: ' Ada@Example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/Sent to ada@example\.com/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(calls).toContainEqual({ url: '/api/dashboards/a/share', method: 'POST', body: { email: 'ada@example.com' } });
  });

  it('lists who it was shared with and their answer', async () => {
    sent = [
      { id: 'x1', toEmail: 'lin@example.com', status: 'PENDING' },
      { id: 'x2', toEmail: 'eve@example.com', status: 'ADDED' },
      { id: 'x3', toEmail: 'bob@example.com', status: 'DECLINED' },
    ];
    renderSwitcher();
    await openShare();
    const list = within(await screen.findByRole('list'));
    expect(list.getByText('lin@example.com').nextSibling?.textContent).toBe('Waiting');
    expect(list.getByText('eve@example.com').nextSibling?.textContent).toBe('Added a copy');
    expect(list.getByText('bob@example.com').nextSibling?.textContent).toBe('Declined');
  });

  it('"Share with someone else" returns to an empty form', async () => {
    renderSwitcher();
    fireEvent.change(await openShare(), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Share with someone else' }));
    expect((screen.getByLabelText('Recipient email') as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(/Sent to/)).toBeNull();
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

  it('says so when the dashboard is already shared with that user', async () => {
    shareError = 'ALREADY_SHARED';
    renderSwitcher();
    fireEvent.change(await openShare(), { target: { value: 'lin@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/Already shared with lin@example\.com/)).toBeTruthy();
    expect(screen.queryByText(/Sent to/)).toBeNull();
  });

  it('clears the earlier success message when the next send fails', async () => {
    renderSwitcher();
    fireEvent.change(await openShare(), { target: { value: 'ada@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Share with someone else' }));
    shareError = 'ALREADY_SHARED';
    fireEvent.change(screen.getByLabelText('Recipient email'), { target: { value: 'lin@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/Already shared with/)).toBeTruthy();
    expect(screen.queryByText(/Sent to/)).toBeNull();
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
    fireEvent.click(await screen.findByRole('button', { name: /Shared with you/ }));
    return within(await screen.findByRole('dialog', { name: 'Shared with you' }));
  }

  it('shows the pending count on the top-bar button and lists dashboard name and sender', async () => {
    renderSwitcher();
    await waitFor(() => expect(screen.getByRole('button', { name: /Shared with you/ }).textContent).toContain('1'));
    const inbox = await openInbox();
    expect(inbox.getByText('Game night')).toBeTruthy();
    expect(inbox.getByText(/grace@example\.com/)).toBeTruthy();
  });

  it('adding creates the copy and opens it', async () => {
    renderSwitcher();
    const inbox = await openInbox();
    fireEvent.click(inbox.getByRole('button', { name: 'Add to my dashboards' }));
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/d/new'));
    expect(calls).toContainEqual({ url: '/api/shares/s1/accept', method: 'POST', body: undefined });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Shared with you' })).toBeNull());
  });

  it('declining removes the share without creating a dashboard', async () => {
    renderSwitcher();
    const inbox = await openInbox();
    fireEvent.click(inbox.getByRole('button', { name: 'Decline' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(inbox.getByText(/Decline this share\?/)).toBeTruthy();
    fireEvent.click(inbox.getByRole('button', { name: 'Keep' }));
    expect(inbox.queryByText(/Decline this share\?/)).toBeNull();
    fireEvent.click(inbox.getByRole('button', { name: 'Decline' }));
    fireEvent.click(inbox.getByRole('button', { name: 'Decline' }));
    expect(await screen.findByText('Nothing shared with you right now.')).toBeTruthy();
    expect(calls).toContainEqual({ url: '/api/shares/s1', method: 'DELETE', body: undefined });
    expect(calls.some((c) => c.url.endsWith('/accept'))).toBe(false);
  });

  it('a share whose dashboard was removed shows "no longer available" and can be dismissed', async () => {
    acceptStatus = 404;
    renderSwitcher();
    const inbox = await openInbox();
    fireEvent.click(inbox.getByRole('button', { name: 'Add to my dashboards' }));
    expect(await screen.findByText('This share is no longer available')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add to my dashboards' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByText('Nothing shared with you right now.')).toBeTruthy();
  });

  it('shows an empty state when nothing is pending', async () => {
    shares = [];
    renderSwitcher();
    const inbox = await openInbox();
    expect(inbox.getByText('Nothing shared with you right now.')).toBeTruthy();
  });
});
