import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchPicker, type PickerOption } from './SearchPicker.js';

interface Item {
  name: string;
  place: string;
}

const PARIS: Item[] = [
  { name: 'Paris', place: 'Île-de-France, France' },
  { name: 'Paris', place: 'Texas, United States' },
];
const toOption = (i: Item): PickerOption => ({ title: i.name, subtitle: i.place });

function Harness({ search, initial = null }: { search: (q: string) => Promise<Item[]>; initial?: Item | null }) {
  const [picked, setPicked] = useState<Item | null>(initial);
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <SearchPicker
        id="param-city"
        queryKey="city"
        search={search}
        toOption={toOption}
        picked={picked && toOption(picked)}
        onPick={setPicked}
        onClear={() => setPicked(null)}
        placeholder="Search a city"
        nouns={['city', 'cities']}
      />
    </QueryClientProvider>
  );
}

const type = (value: string) => fireEvent.change(screen.getByRole('combobox'), { target: { value } });

afterEach(cleanup);

describe('SearchPicker', () => {
  it('lists every candidate with its disambiguating detail', async () => {
    render(<Harness search={async () => PARIS} />);

    type('Paris');

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain('Île-de-France, France');
    expect(options[1].textContent).toContain('Texas, United States');
    expect(screen.getByText(/2 cities/)).toBeTruthy();
  });

  it('shows skeleton rows and "Searching…" immediately, even while the debounce is pending', () => {
    const search = vi.fn(() => new Promise<Item[]>(() => {}));
    render(<Harness search={search} />);

    type('Berlin');

    expect(screen.getByText('Searching…')).toBeTruthy();
    expect(screen.queryByText('Type a city name to see matches.')).toBeNull();
    expect(screen.getByLabelText('Searching cities').getAttribute('aria-busy')).toBe('true');
  });

  it('asks for more characters instead of searching on a one-character query', () => {
    const search = vi.fn(async () => PARIS);
    render(<Harness search={search} />);

    type('P');

    expect(screen.getByText('Keep typing: at least 2 characters.')).toBeTruthy();
    expect(search).not.toHaveBeenCalled();
  });

  it('shows a clear empty state, not an error, when nothing matches', async () => {
    render(<Harness search={async () => []} />);

    type('Atlantis');

    expect(await screen.findByText(/No cities match/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('shows an error with Retry when the search fails, and recovers on retry', async () => {
    const search = vi.fn<(q: string) => Promise<Item[]>>().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(PARIS);
    render(<Harness search={search} />);

    type('Paris');
    expect((await screen.findByRole('alert')).textContent).toContain('City search is unavailable');
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));

    expect(await screen.findAllByRole('option')).toHaveLength(2);
  });

  it('picks with the mouse: swaps the list for the chosen candidate and Change brings the search back', async () => {
    render(<Harness search={async () => PARIS} />);
    type('Paris');

    fireEvent.click((await screen.findAllByRole('option'))[1]);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Texas, United States')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change' })));

    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('combobox')));
  });

  it('picks with the keyboard: arrows move the active option, Enter picks it', async () => {
    render(<Harness search={async () => PARIS} />);
    type('Paris');
    const input = screen.getByRole('combobox');
    await screen.findAllByRole('option');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('Texas, United States')).toBeTruthy();
  });

  it('starts on the chosen candidate when one is already picked', () => {
    render(<Harness search={async () => PARIS} initial={PARIS[0]} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Île-de-France, France')).toBeTruthy();
  });
});
