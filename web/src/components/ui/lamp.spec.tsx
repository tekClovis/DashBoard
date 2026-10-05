import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Lamp, type LampState } from './lamp.js';

afterEach(cleanup);

const shapes: [LampState, string[]][] = [
  ['live', ['rounded-full', 'bg-live']],
  ['stale', ['rounded-full', 'border-warning']],
  ['paused', ['rounded-full', 'border-warning']],
  ['warn', ['rotate-45', 'bg-warning']],
  ['error', ['rounded-[1px]', 'bg-destructive']],
  ['waiting', ['rounded-full', 'border-dashed', 'border-muted-foreground']],
  ['off', ['rounded-full', 'border-muted-foreground']],
];

describe('Lamp', () => {
  it.each(shapes)('draws the %s state with its shape and colour', (state, classes) => {
    const { container } = render(<Lamp state={state} />);
    const lamp = container.firstElementChild as HTMLElement;
    expect(lamp.dataset.state).toBe(state);
    for (const cls of classes) expect(lamp.className).toContain(cls);
  });

  it('is decorative without a label', () => {
    const { container } = render(<Lamp state="live" />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('carries a visually hidden name when labelled', () => {
    const { container, getByText } = render(<Lamp state="error" label="Error" />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBeNull();
    expect(getByText('Error').className).toContain('sr-only');
  });
});
