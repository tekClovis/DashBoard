import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { buttonVariants } from '@/components/ui/button.js';
import { DialogOverlay } from '@/components/ui/dialog.js';
import { cn } from '@/lib/utils.js';

/** shadcn Sheet: the Radix dialog as a left-edge panel (mobile nav). */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

function SheetContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'bg-background text-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-left-6 fixed inset-y-0 left-0 z-50 flex h-dvh w-[min(300px,86vw)] flex-col border-r duration-(--dur) ease-out',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'absolute top-1 right-2')}>
          <X className="size-4" strokeWidth={1.75} aria-hidden />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-base font-semibold', className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-muted-foreground text-[0.8125rem]', className)} {...props} />;
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger };
