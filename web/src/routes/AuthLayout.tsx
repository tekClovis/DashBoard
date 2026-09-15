import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle.js';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="border-border bg-card w-full max-w-sm rounded-lg border p-6 shadow-xs">
        <h1 className="mb-6 text-lg font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}
