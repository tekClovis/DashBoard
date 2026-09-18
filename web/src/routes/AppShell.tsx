import { NavLink, Outlet } from 'react-router';
import { useMe } from '@/api/auth.js';
import { useDashboards } from '@/api/dashboards.js';
import { ThemeToggle } from '@/components/theme-toggle.js';
import { SocketProvider, useSocket } from '@/realtime/SocketProvider.js';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `text-sm ${isActive ? 'text-foreground font-semibold' : 'text-muted-foreground'} hover:text-foreground`;
}

function ShellHeader() {
  const { data: me } = useMe();
  const { data: dashboards } = useDashboards();
  const { connected } = useSocket();
  const homeId = dashboards?.dashboards[0]?.id ?? 'placeholder';

  return (
    <header className="flex items-center justify-between border-b px-5 py-3">
      <span className="font-semibold">Dashboard</span>
      <nav className="flex items-center gap-4">
        <NavLink to={`/d/${homeId}`} className={navLinkClass}>
          Home
        </NavLink>
        <NavLink to="/services" className={navLinkClass}>
          Services
        </NavLink>
        <NavLink to="/profile" className={navLinkClass}>
          Profile
        </NavLink>
        {me?.role === 'ADMIN' && (
          <NavLink to="/admin" className={navLinkClass}>
            Admin
          </NavLink>
        )}
      </nav>
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-zinc-400'}`}
          aria-hidden="true"
        />
        <span className="text-muted-foreground text-xs">{connected ? 'connected' : 'connecting…'}</span>
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Authenticated app shell: nav header + realtime socket connection, per docs/Architecture.md §9. */
export function AppShell() {
  return (
    <SocketProvider>
      <div className="bg-background min-h-svh">
        <ShellHeader />
        <main>
          <Outlet />
        </main>
      </div>
    </SocketProvider>
  );
}
