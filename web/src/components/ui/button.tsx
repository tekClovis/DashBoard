import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils.js';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent text-[0.8125rem] leading-none font-medium select-none transition-colors duration-(--dur-fast) ease-out disabled:cursor-not-allowed disabled:opacity-45 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:not-disabled:bg-primary/86',
        destructive:
          'text-destructive border-destructive/45 hover:not-disabled:bg-destructive/10',
        'destructive-solid': 'bg-destructive text-destructive-foreground hover:not-disabled:bg-destructive/90',
        outline: 'border-input/70 bg-transparent hover:not-disabled:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:not-disabled:bg-secondary/80',
        ghost: 'text-foreground hover:not-disabled:bg-accent',
        link: 'text-foreground underline underline-offset-3',
      },
      size: {
        default: 'h-10 px-3 md:h-8',
        sm: 'h-9 px-2.5 text-xs md:h-7',
        icon: 'size-10 md:size-8',
        'icon-sm': 'size-9 md:size-7',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0 md:h-auto' }],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
