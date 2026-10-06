import type { SearchResult } from '@dashboard/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchPicker } from './SearchPicker.js';

const RESULTS = [
  { id: 'UC1', title: 'Telemetry Labs', thumbnail: 'https://img/1.jpg' },
  { id: 'UC2', title: 'Tele Two' },
];

function Harness({
  initial = '',
  onValue,
  onPick,
  savedTitle,
}: {
  initial?: string;
  onValue?: (v: string) => void;
  onPick?: (r: SearchResult | null) => void;
  savedTitle?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <QueryClientProvider client={new QueryClient()}>
      <SearchPicker
        id="param-channel_id"
        endpoint="/youtube/channels/search"
        noun="channel"
        savedTitle={savedTitle}
        onPick={onPick}
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue?.(v);
        }}
      />
    </QueryClientProvider>
  );
}

function respond(status: number, body: unknown) {
  vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

const type = (text: string) => fireEvent.change(screen.getByRole('searchbox'), { target: { value: text } });

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SearchPicker', () => {
  it('searches the endpoint for the typed name and lists each match with its title, id and avatar', async () => {
    respond(200, { results: RESULTS });
    render(<Harness />);
    expect(screen.getByText('Type at least 2 letters of a channel name.')).toBeTruthy();

    type('tele');

    expect(await screen.findByText('2 channels found. Pick one.')).toBeTruthy();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/api/youtube/channels/search?q=tele']);
    expect(screen.getByText('Telemetry Labs')).toBeTruthy();
    expect(screen.getByText('UC2')).toBeTruthy();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('https://img/1.jpg');
  });

  it('does not search below 2 characters', async () => {
    respond(200, { results: RESULTS });
    render(<Harness />);
    type('t');
    await new Promise((r) => setTimeout(r, 400));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('saves the picked id, shows the choice, and Change clears it and refocuses the search', async () => {
    respond(200, { results: RESULTS });
    const onValue = vi.fn();
    const onPick = vi.fn();
    render(<Harness onValue={onValue} onPick={onPick} />);
    type('tele');
    fireEvent.click(await screen.findByRole('button', { name: /Telemetry Labs/ }));

    expect(onValue).toHaveBeenLastCalledWith('UC1');
    expect(onPick).toHaveBeenLastCalledWith(RESULTS[0]);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.getByText('Channel selected. Its ID is saved with the widget.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onValue).toHaveBeenLastCalledWith('');
    expect(onPick).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox')));
  });

  it('shows an already-saved id as the picked channel', () => {
    render(<Harness initial="UCsaved" />);
    expect(screen.getAllByText('UCsaved').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy();
  });

  it('shows the remembered title of a saved id', () => {
    render(<Harness initial="UCsaved" savedTitle="Telemetry Labs" />);
    expect(screen.getByText('Telemetry Labs')).toBeTruthy();
  });

  it('says so when nothing matches', async () => {
    respond(200, { results: [] });
    render(<Harness />);
    type('zzqxv');
    expect(await screen.findByText('No channels match “zzqxv”')).toBeTruthy();
  });

  it('shows a clear error on an API failure, and Try again searches again', async () => {
    respond(502, { error: 'UPSTREAM_ERROR' });
    render(<Harness />);
    type('tele');
    expect(await screen.findByText('Couldn’t search for channels')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();

    respond(200, { results: RESULTS });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('2 channels found. Pick one.')).toBeTruthy();
  });
});
