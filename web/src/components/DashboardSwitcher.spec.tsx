import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardSwitcher } from './DashboardSwitcher.js';

interface Dash {
  id: string;
  name: string;
  position: number;
}
let db: Dash[];
let calls: { url: string; method: string; body?: unknown }[];
let failNext: boolean;

beforeEach(() => {
  db = [
    { id: 'a', name: 'Home', position: 0 },
    { id: 'b', name: 'Work', position: 1 },
  ];
  calls = [];
  failNext = false;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ url, method, body });
      const json = (data: unknown, ok = true) =>
        Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(data) });
      if (method !== 'GET' && failNext) return json({}, false);
      const id = url.split('/')[3];
      if (method === 'POST') {
        const created = { id: 'new', name: body.name, position: db.length };
        db.push(created);
        return json(created);
      }
      if (method === 'PATCH') {
        db.find((d) => d.id === id)!.name = body.name;
        return json(db.find((d) => d.id === id));
      }
      if (method === 'DELETE') {
        db = db.filter((d) => d.id !== id);
        return json({ ok: true });
      }
      return json({ dashboards: db });
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

function renderSwitcher(path = '/d/a') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
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

const path = () => screen.getByTestId('path').textContent;

describe('DashboardSwitcher', () => {
  it('lists the dashboards and marks the active one', async () => {
    renderSwitcher();
    expect(await screen.findByRole('button', { name: 'Switch dashboard, current: Home' })).toBeTruthy();
    const menu = await openMenu();
    expect(menu.getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(menu.getByRole('button', { name: 'Work' }).getAttribute('aria-current')).toBeNull();
  });

  it('switching navigates to /d/<id>', async () => {
    renderSwitcher();
    const menu = await openMenu();
    fireEvent.click(menu.getByRole('button', { name: 'Work' }));
    expect(path()).toBe('/d/b');
    expect(screen.queryByRole('dialog', { name: 'Dashboards' })).toBeNull();
  });

  it('creates a dashboard, then navigates to it', async () => {
    renderSwitcher();
    const menu = await openMenu();
    fireEvent.click(menu.getByRole('button', { name: 'New dashboard' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: '  Gaming ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create dashboard' }));
    await waitFor(() => expect(path()).toBe('/d/new'));
    expect(calls).toContainEqual({ url: '/api/dashboards', method: 'POST', body: { name: 'Gaming' } });
    expect(await screen.findByRole('button', { name: 'Switch dashboard, current: Gaming' })).toBeTruthy();
  });

  it('rejects an empty or duplicate name without calling the API', async () => {
    renderSwitcher();
    const menu = await openMenu();
    fireEvent.click(menu.getByRole('button', { name: 'New dashboard' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create dashboard' }));
    expect(await screen.findByText('Enter a name.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create dashboard' }));
    expect(await screen.findByText('You already have a dashboard with this name.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows an error and stays open when creating fails', async () => {
    renderSwitcher();
    const menu = await openMenu();
    fireEvent.click(menu.getByRole('button', { name: 'New dashboard' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Gaming' } });
    failNext = true;
    fireEvent.click(screen.getByRole('button', { name: 'Create dashboard' }));
    expect(await screen.findByText('Couldn’t create the dashboard. Try again.')).toBeTruthy();
    expect(path()).toBe('/d/a');
  });

  it('renames a dashboard and the list shows the new name', async () => {
    renderSwitcher();
    const menu = await openMenu();
    fireEvent.click(menu.getByRole('button', { name: 'Rename Home' }));
    const input = await screen.findByLabelText('Name');
    expect((input as HTMLInputElement).value).toBe('Home');
    fireEvent.change(input, { target: { value: 'Main' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('button', { name: 'Switch dashboard, current: Main' })).toBeTruthy();
    expect(calls).toContainEqual({ url: '/api/dashboards/a', method: 'PATCH', body: { name: 'Main' } });
  });

  it('deleting the active dashboard asks to confirm, then navigates to another', async () => {
    renderSwitcher('/d/b');
    const menu = await openMenu();
    fireEvent.click(menu.getByRole('button', { name: 'Delete Work' }));
    expect(await screen.findByText('Delete “Work”?')).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Delete dashboard' }));
    await waitFor(() => expect(path()).toBe('/d/a'));
    expect(calls).toContainEqual({ url: '/api/dashboards/b', method: 'DELETE', body: undefined });
  });

  it('deleting an inactive dashboard keeps the URL', async () => {
    renderSwitcher('/d/a');
    const menu = await openMenu();
    fireEvent.click(menu.getByRole('button', { name: 'Delete Work' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete dashboard' }));
    await waitFor(() => expect(screen.queryByText('Delete “Work”?')).toBeNull());
    expect(path()).toBe('/d/a');
  });

  it('cannot delete the only dashboard', async () => {
    db = [{ id: 'a', name: 'Home', position: 0 }];
    renderSwitcher();
    const menu = await openMenu();
    expect((menu.getByRole('button', { name: 'Delete Home' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
