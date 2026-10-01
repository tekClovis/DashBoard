import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from './button.js';
import { Input } from './input.js';

afterEach(cleanup);

describe('control sizes', () => {
  it.each([
    ['default', 'h-10', 'md:h-8'],
    ['sm', 'h-9', 'md:h-7'],
    ['icon', 'size-10', 'md:size-8'],
    ['icon-sm', 'size-9', 'md:size-7'],
  ] as const)('sizes a %s button 40/36 px below md and 32/28 px above', (size, mobile, desktop) => {
    render(<Button size={size}>b</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain(mobile);
    expect(cls).toContain(desktop);
  });

  it('sizes inputs 40 px below md and 32 px above', () => {
    render(<Input aria-label="Email" />);
    const cls = screen.getByRole('textbox').className;
    expect(cls).toContain('h-10');
    expect(cls).toContain('md:h-8');
  });
});

describe('Button variants', () => {
  it('draws destructive as an outline with destructive text', () => {
    render(<Button variant="destructive">Delete</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('text-destructive');
    expect(cls).toContain('border-destructive/45');
    expect(cls).not.toContain('bg-destructive ');
  });

  it('keeps a solid destructive variant for confirm dialogs', () => {
    render(<Button variant="destructive-solid">Delete user</Button>);
    const cls = screen.getByRole('button').className;
    expect(cls).toContain('bg-destructive');
    expect(cls).toContain('text-destructive-foreground');
  });
});
