import * as React from 'react';
import { cn } from '@/lib/utils.js';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('bg-muted animate-pulse rounded-sm motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

export { Skeleton };
