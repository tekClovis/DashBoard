import type { ReactNode } from 'react';
import { cn } from '@/lib/utils.js';

/** Title + one-line sub for every authed page; `children` (e.g. a primary action) sit on the right. */
export function PageHead({
  title,
  sub,
  className,
  children,
}: {
  title: string;
  sub?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        <h1 className="text-lg leading-[1.3] font-semibold tracking-[-0.01em] text-balance">{title}</h1>
        {sub && <p className="text-muted-foreground mt-0.5 text-[0.8125rem] text-pretty">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
