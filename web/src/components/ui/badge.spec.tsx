import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge } from './badge.js';

afterEach(cleanup);

describe('Badge', () => {
  it('defaults to the neutral outlined badge', () => {
    render(<Badge>USER</Badge>);
    const badge = screen.getByText('USER');
    expect(badge.dataset.variant).toBe('default');
    expect(badge.className).toContain('text-muted-foreground');
    expect(badge.className).toContain('h-5');
    expect(badge.className).toContain('rounded-sm');
  });

  it.each(['success', 'warning', 'destructive'] as const)('tints the %s tone at 10%%', (variant) => {
    render(<Badge variant={variant}>label</Badge>);
    const badge = screen.getByText('label');
    expect(badge.dataset.variant).toBe(variant);
    expect(badge.className).toContain(`text-${variant}`);
    expect(badge.className).toContain(`bg-${variant}/10`);
  });

  it('renders the solid secondary badge', () => {
    render(<Badge variant="secondary">ADMIN</Badge>);
    expect(screen.getByText('ADMIN').className).toContain('bg-secondary');
  });
});
