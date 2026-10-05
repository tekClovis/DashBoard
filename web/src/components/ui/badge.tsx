import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils.js';

const badgeVariants = cva(
  'inline-flex h-5 items-center gap-[5px] rounded-sm border px-[7px] text-[0.6875rem] leading-none font-[550] whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'text-muted-foreground',
        secondary: 'bg-secondary border-transparent text-foreground',
        success: 'text-success bg-success/10 border-success/32',
        warning: 'text-warning bg-warning/10 border-warning/36',
        destructive: 'text-destructive bg-destructive/10 border-destructive/36',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
