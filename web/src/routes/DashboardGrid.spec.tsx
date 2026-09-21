import { cleanup, screen } from '@testing-library/react';
import { noCompactor } from 'react-grid-layout';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, setupPage } from './dashboard-test-utils.js';

const gridProps = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }));

vi.mock('react-grid-layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-grid-layout')>()),
  ResponsiveGridLayout: (props: Record<string, unknown>) => {
    gridProps.current = props;
    return null;
  },
}));

beforeEach(() => {
  setupPage();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DashboardPage grid (md+)', () => {
  // A vertical compactor would draw a lone widget's Move down (y+1) in place, diverging from the stored y.
  it('renders the stored layout without compaction', async () => {
    renderPage();
    await vi.waitFor(() => expect(gridProps.current?.layouts).toBeTruthy());
    expect(gridProps.current?.compactor).toBe(noCompactor);
    expect(screen.queryByText('Could not load your widgets.')).toBeNull();
  });
});
