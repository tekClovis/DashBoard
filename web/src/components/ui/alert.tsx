import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils.js';

/** Tinted tones stay at 10% or less so light-mode text keeps 4.5:1. */
const alertVariants = cva(
  'flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[0.8125rem] [&>svg]:mt-px [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      tone: {
        default: '',
        warning: 'border-warning/40 bg-warning/8 [&>svg]:text-warning',
        destructive: 'border-destructive/40 bg-destructive/7 [&>svg]:text-destructive',
        success: '[&>svg]:text-success',
      },
    },
    defaultVariants: {
      tone: 'default',
    },
  },
);

function Alert({
  className,
  tone = 'default',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-tone={tone}
      role={tone === 'destructive' ? 'alert' : 'status'}
      className={cn(alertVariants({ tone, className }))}
      {...props}
    />
  );
}

/** Wraps title + description so an icon and an action can sit either side. */
function AlertContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-content" className={cn('grid min-w-0 flex-1 gap-0.5', className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="alert-title" className={cn('font-semibold', className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="alert-description" className={cn('text-muted-foreground', className)} {...props} />;
}

export { Alert, AlertContent, AlertDescription, AlertTitle };
