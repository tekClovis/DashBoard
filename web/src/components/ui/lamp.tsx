import * as React from 'react';
import { cn } from '@/lib/utils.js';

/** The shape carries the state, the colour reinforces it (design-reference §4). */
const LAMP_SHAPES = {
  live: 'rounded-full bg-live dark:shadow-[0_0_6px_color-mix(in_oklch,var(--live)_55%,transparent)]',
  stale: 'rounded-full border-[1.5px] border-warning',
  paused: 'rounded-full border-[1.5px] border-warning',
  warn: 'm-[0.5px] size-[7px] rotate-45 rounded-[1px] bg-warning',
  error: 'rounded-[1px] bg-destructive',
  waiting: 'rounded-full border-[1.5px] border-dashed border-muted-foreground',
  off: 'rounded-full border-[1.5px] border-muted-foreground',
  neutral: 'rounded-full bg-muted-foreground',
} as const;

type LampState = keyof typeof LAMP_SHAPES;

function Lamp({
  state,
  label,
  className,
  ...props
}: React.ComponentProps<'span'> & { state: LampState; label?: string }) {
  return (
    <span
      data-slot="lamp"
      data-state={state}
      aria-hidden={label ? undefined : true}
      className={cn(
        'relative inline-block size-2 flex-none forced-color-adjust-none',
        LAMP_SHAPES[state],
        className,
      )}
      {...props}
    >
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

export { Lamp, type LampState };
