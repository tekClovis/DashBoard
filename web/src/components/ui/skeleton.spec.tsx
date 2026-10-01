import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Skeleton } from './skeleton.js';

afterEach(cleanup);

describe('Skeleton', () => {
  it('is a decorative muted block that stops pulsing under reduced motion', () => {
    const { container } = render(<Skeleton className="h-3 w-24" />);
    const sk = container.firstElementChild as HTMLElement;
    expect(sk.getAttribute('aria-hidden')).toBe('true');
    expect(sk.className).toContain('bg-muted');
    expect(sk.className).toContain('animate-pulse');
    expect(sk.className).toContain('motion-reduce:animate-none');
    expect(sk.className).toContain('w-24');
  });
});
