import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';
import { cn } from '@/lib/utils.js';

const Dialog = DialogPrimitive.Root;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-[oklch(0.1_0.01_160/62%)]',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-1.5 fixed top-1/2 left-1/2 z-50 grid max-h-[min(760px,calc(100dvh-2rem))] w-[min(600px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-lg border p-4 shadow-[0_24px_64px_-24px_oklch(0_0_0/50%)] duration-(--dur) ease-out',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogContent, DialogDescription, DialogOverlay, DialogTitle };
