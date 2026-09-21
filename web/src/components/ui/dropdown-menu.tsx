import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as React from 'react';
import { cn } from '@/lib/utils.js';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

function DropdownMenuContent({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align="end"
        className={cn('bg-popover text-popover-foreground z-50 min-w-36 rounded-md border p-1 shadow-md', className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger };
