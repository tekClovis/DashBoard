import { CircleAlert, Mail } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ThemeToggle } from '@/components/theme-toggle.js';
import { Alert, AlertContent } from '@/components/ui/alert.js';
import { Card } from '@/components/ui/card.js';

function BrandMark() {
  return (
    <svg className="size-[18px]" viewBox="0 0 18 18" aria-hidden>
      <rect x="1" y="1" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="1" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="10" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="10" width="7" height="7" rx="1.2" fill="currentColor" />
    </svg>
  );
}

/** Single 380px panel: brand + theme toggle header strip, then the screen's title and body. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-background grid min-h-svh items-start justify-items-center px-4 pt-4 pb-8 md:items-center md:py-8">
      <main id="main" tabIndex={-1} className="w-full max-w-[380px]">
        <Card className="overflow-hidden">
          <div className="flex h-11 items-center justify-between border-b pr-1.5 pl-3.5">
            <span className="inline-flex items-center gap-2 text-sm font-[650] tracking-[-0.015em] [font-stretch:112%]">
              <BrandMark />
              dashboard
            </span>
            <ThemeToggle />
          </div>
          <div className="grid gap-4 p-5">
            <h1 className="text-xl font-semibold">{title}</h1>
            {children}
          </div>
        </Card>
      </main>
    </div>
  );
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-[0.8125rem]">{children}</p>;
}

export function AuthFooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-foreground underline underline-offset-3">
      {children}
    </Link>
  );
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-destructive flex items-start gap-1.5 text-xs">
      <CircleAlert className="mt-px size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      {children}
    </p>
  );
}

export const RESENT_MESSAGE = 'If that account needs a new link, it’s on its way.';

export function ResentNotice() {
  return (
    <Alert>
      <Mail strokeWidth={1.75} aria-hidden />
      <AlertContent>{RESENT_MESSAGE}</AlertContent>
    </Alert>
  );
}
