import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isHttpUrl, pushTrail, RowTitle, Sparkline, Thumb } from './parts.js';

afterEach(cleanup);

type D = { city: string; t: number };
const push = (city: string, t: number, fetchedAt: string) => ({ data: { city, t } satisfies D, fetchedAt });
const trail = (data: D, fetchedAt: string, history: ReturnType<typeof push>[]) =>
  pushTrail<D, number>({ data, fetchedAt, history }, (d) => d.city, (d) => d.t);

describe('pushTrail', () => {
  it('maps cached pushes oldest first, ending on the shown payload', () => {
    const history = [push('Paris', 17, 'a'), push('Paris', 18, 'b')];
    expect(trail({ city: 'Paris', t: 18 }, 'b', history)).toEqual([
      { at: 'a', value: 17 },
      { at: 'b', value: 18 },
    ]);
  });

  it('appends the shown payload when the history does not end on it', () => {
    expect(trail({ city: 'Paris', t: 19 }, 'c', [push('Paris', 17, 'a')])).toEqual([
      { at: 'a', value: 17 },
      { at: 'c', value: 19 },
    ]);
  });

  it('keeps only the trailing pushes that watch the same thing as the shown payload', () => {
    const history = [push('Paris', 20, 'a'), push('Reykjavik', 10, 'b'), push('Paris', 21, 'c')];
    expect(trail({ city: 'Paris', t: 21 }, 'c', history)).toEqual([{ at: 'c', value: 21 }]);
  });
});

describe('Sparkline', () => {
  it('carries the same points in a visually hidden table', () => {
    render(
      <Sparkline
        points={[
          { at: '2026-10-01T12:00:00Z', value: 17 },
          { at: '2026-10-01T12:05:00Z', value: 18.4 },
        ]}
        label="Temperature, last 2 updates, °C"
        unit="°"
      />,
    );
    expect(screen.getByRole('img', { name: 'Temperature, last 2 updates, °C' })).toBeTruthy();
    const cells = screen.getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toContain('17°');
    expect(cells).toContain('18.4°');
  });
});

describe('RowTitle', () => {
  it('links only http(s) URLs and keeps the full title as a tooltip', () => {
    render(
      <>
        <RowTitle href="https://github.com/a/b">Safe</RowTitle>
        <RowTitle href="javascript:alert(1)">Unsafe</RowTitle>
      </>,
    );
    expect(screen.getByRole('link', { name: 'Safe' }).getAttribute('title')).toBe('Safe');
    expect(screen.queryByRole('link', { name: 'Unsafe' })).toBeNull();
    expect(isHttpUrl('ftp://x')).toBe(false);
  });
});

describe('Thumb', () => {
  const imgs = (c: HTMLElement) => c.querySelectorAll('img');

  it('renders a lazy, decorative image for an http(s) src', () => {
    const { container } = render(<Thumb src="https://cdn.example/a.jpg" width={64} height={30} />);
    const img = imgs(container)[0];
    expect(img.getAttribute('src')).toBe('https://cdn.example/a.jpg');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('keeps the slot but drops the img for a missing or non-http(s) src', () => {
    for (const src of [null, undefined, 'javascript:alert(1)']) {
      const { container, unmount } = render(<Thumb src={src} width={64} height={30} />);
      expect(imgs(container)).toHaveLength(0);
      expect(container.querySelector('[data-slot="thumb"]')).not.toBeNull();
      unmount();
    }
  });

  it('falls back to the placeholder when the image fails to load', () => {
    const { container } = render(<Thumb src="https://cdn.example/a.jpg" width={64} height={30} />);
    fireEvent.error(imgs(container)[0]);
    expect(imgs(container)).toHaveLength(0);
    expect(container.querySelector('[data-slot="thumb"]')?.getAttribute('data-state')).toBe('failed');
  });
});
