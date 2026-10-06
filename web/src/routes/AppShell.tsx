import { LayoutGrid, LogOut, Menu, Moon, OctagonX, Plug, Sun, TriangleAlert, User, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useMatch, useNavigate } from 'react-router';
import { useLogout, useMe } from '@/api/auth.js';
import { useDashboards } from '@/api/dashboards.js';
import { ThemeToggle } from '@/components/theme-toggle.js';
import { InboxButton } from '@/components/DashboardShare.js';
import { DashboardSwitcher } from '@/components/DashboardSwitcher.js';
import { Alert } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { Lamp } from '@/components/ui/lamp.js';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet.js';
import { useTheme } from '@/lib/theme.js';
import { cn } from '@/lib/utils.js';
import { SocketProvider, useSocket } from '@/realtime/SocketProvider.js';
import { DashboardPage } from './DashboardPage.js';

interface NavItem {
  to: string;
  /** Path prefix that marks this item as the current page. */
  match: string;
  label: string;
  icon: LucideIcon;
}

const brandClass = 'inline-flex items-center gap-2 text-[0.9375rem] font-[650] tracking-[-0.015em] [font-stretch:112%]';

/** 2×2 mark + wordmark; the caller supplies the wrapper (link in the topbar, plain span in the sheet). */
function Brand() {
  return (
    <>
      <svg className="size-4.5" viewBox="0 0 18 18" aria-hidden="true">
        <rect x="1" y="1" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x="10" y="1" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x="1" y="10" width="7" height="7" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <rect x="10" y="10" width="7" height="7" rx="1.2" fill="currentColor" />
      </svg>
      <span>dashboard</span>
    </>
  );
}

function useShellNav() {
  const { data: me } = useMe();
  const { data: dashboards } = useDashboards();
  const { pathname } = useLocation();
  const homeId = dashboards?.dashboards[0]?.id ?? 'placeholder';

  const items: NavItem[] = [
    { to: `/d/${homeId}`, match: '/d/', label: 'Dashboard', icon: LayoutGrid },
    { to: '/services', match: '/services', label: 'Services', icon: Plug },
  ];
  const admin: NavItem = { to: '/admin', match: '/admin', label: 'Admin', icon: Users };
  const profile: NavItem = { to: '/profile', match: '/profile', label: 'Profile', icon: User };
  const isAdmin = me?.role === 'ADMIN';
  return {
    me,
    nav: isAdmin ? [...items, admin] : items,
    /** The mobile sheet also carries Profile (the account menu is desktop only). */
    sheetNav: isAdmin ? [...items, profile, admin] : [...items, profile],
    current: (item: NavItem) => (pathname.startsWith(item.match) ? ('page' as const) : undefined),
  };
}

function useLogoutToLogin() {
  const logout = useLogout();
  const navigate = useNavigate();
  return {
    pending: logout.isPending,
    logOut: () => logout.mutate(undefined, { onSuccess: () => navigate('/login') }),
  };
}

function ConnectionChip() {
  const { connection } = useSocket();
  return (
    <div
      role="status"
      data-testid="connection"
      className={cn(
        'inline-flex h-7 items-center gap-2 rounded-md border px-2.5 text-xs font-medium whitespace-nowrap',
        connection.status === 'reconnecting' && 'border-warning/40',
        connection.status === 'offline' && 'border-destructive/45',
      )}
    >
      {connection.status === 'live' && (
        <>
          <Lamp state="live" />
          <span>Live</span>
        </>
      )}
      {connection.status === 'reconnecting' && (
        <>
          <Lamp state="stale" />
          <span>Reconnecting</span>
          {connection.attempt > 0 && (
            <span className="text-muted-foreground hidden font-mono text-[0.6875rem] md:inline">
              #{connection.attempt}
            </span>
          )}
        </>
      )}
      {connection.status === 'offline' && (
        <>
          <Lamp state="error" />
          <span>Offline</span>
        </>
      )}
    </div>
  );
}

const bannerClass = 'items-center rounded-none border-x-0 border-t-0 border-b-border px-4 py-2 flex-wrap md:flex-nowrap md:px-6';

/** Shown once the manager is actually retrying (attempt ≥ 1) or has given up. */
function ConnectionBanner() {
  const { connection, retry } = useSocket();
  if (connection.status === 'reconnecting' && connection.attempt > 0) {
    return (
      <Alert tone="warning" className={cn(bannerClass, 'bg-warning/9')}>
        <TriangleAlert strokeWidth={1.75} aria-hidden />
        <span>Live updates paused. Widgets show the last data received.</span>
        <span className="text-muted-foreground font-mono text-[0.6875rem]">Reconnecting, attempt {connection.attempt}</span>
      </Alert>
    );
  }
  if (connection.status === 'offline') {
    return (
      <Alert tone="destructive" className={cn(bannerClass, 'bg-destructive/8')}>
        <OctagonX strokeWidth={1.75} aria-hidden />
        <span>Can’t reach the server. Widgets show the last data received.</span>
        <span className="flex-1" />
        <Button variant="outline" size="sm" onClick={retry}>
          Retry now
        </Button>
      </Alert>
    );
  }
  return null;
}

function AccountMenu({ email }: { email: string }) {
  const { logOut, pending } = useLogoutToLogin();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account: ${email}`}
        className="bg-secondary hidden size-7 place-items-center rounded-full text-xs font-semibold md:grid"
      >
        {email.charAt(0).toUpperCase()}
      </DropdownMenuTrigger>
      <DropdownMenuContent sideOffset={4}>
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <User strokeWidth={1.75} className="size-3.5" aria-hidden />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onSelect={logOut}>
          <LogOut strokeWidth={1.75} className="size-3.5" aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileMenu({ me, sheetNav, current }: Omit<ReturnType<typeof useShellNav>, 'nav'>) {
  const { logOut, pending } = useLogoutToLogin();
  const [theme, toggleTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const email = me?.email ?? '';

  // The sheet is below md only: close it if the viewport grows.
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu strokeWidth={1.75} />
        </Button>
      </SheetTrigger>
      <SheetContent
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          const currentLink = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
          if (!currentLink) return;
          e.preventDefault();
          currentLink.focus();
        }}
      >
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <div className="flex h-12 items-center border-b pr-2 pl-4">
          <span className={brandClass}>
            <Brand />
          </span>
        </div>
        <nav ref={navRef} aria-label="Main" className="grid gap-0.5 p-2">
          {sheetNav.map((item) => (
            <Link
              key={item.match}
              to={item.to}
              aria-current={current(item)}
              onClick={() => setOpen(false)}
              className="hover:bg-accent focus-visible:outline-ring aria-[current=page]:bg-accent flex h-10 items-center gap-2 rounded-sm px-2 text-[0.8125rem] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 aria-[current=page]:font-semibold"
            >
              <item.icon className="size-4" strokeWidth={1.75} aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto grid gap-2.5 border-t px-4 py-3">
          <Button variant="outline" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun strokeWidth={1.75} /> : <Moon strokeWidth={1.75} />}
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </Button>
          <div className="flex items-center gap-2.5">
            <span className="bg-secondary grid size-7 place-items-center rounded-full text-xs font-semibold">
              {email.charAt(0).toUpperCase()}
            </span>
            <div>
              <div className="text-[0.8125rem]">{email}</div>
              <div className="text-muted-foreground font-mono text-[0.6875rem]">{me?.role}</div>
            </div>
          </div>
          <Button variant="outline" disabled={pending} onClick={logOut}>
            <LogOut strokeWidth={1.75} />
            Log out
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ShellHeader() {
  const { nav, ...shellNav } = useShellNav();
  const { me, current } = shellNav;

  return (
    <header className="bg-background/92 sticky top-0 z-30 flex h-12 items-center gap-2 border-b pr-2 pl-4 backdrop-blur-sm md:gap-5 md:px-6">
      <MobileMenu {...shellNav} />
      <Link to={nav[0].to} className={cn(brandClass, 'max-md:hidden')}>
        <Brand />
      </Link>
      <DashboardSwitcher />
      <nav aria-label="Main" className="hidden h-12 items-stretch gap-0.5 md:flex">
        {nav.map((item) => (
          <Link
            key={item.match}
            to={item.to}
            aria-current={current(item)}
            className="text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground relative inline-flex items-center px-2.5 text-[0.8125rem] font-medium aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-2.5 aria-[current=page]:after:-bottom-px aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <InboxButton />
        <ConnectionChip />
        <ThemeToggle />
        {me && <AccountMenu email={me.email} />}
      </div>
    </header>
  );
}

/**
 * Keep-alive for the last-visited dashboard (docs/Architecture.md §9): it stays mounted, hidden and
 * inert, while Services / Profile / Admin show, so its widgets, subscriptions, grid and scroll survive.
 * Only one dashboard is kept; a different one replaces it. It lives and dies with the shell (logout
 * unmounts it), and a deleted dashboard renders nothing, which drops its subscriptions.
 */
function KeptDashboard() {
  const activeId = useMatch('/d/:dashboardId')?.params.dashboardId;
  const [keptId, setKeptId] = useState(activeId);
  if (activeId && activeId !== keptId) setKeptId(activeId);
  const visible = Boolean(activeId);
  const scrollY = useRef(0);

  useLayoutEffect(() => {
    if (!visible) return;
    if (scrollY.current > 0) window.scrollTo(0, scrollY.current);
    const onScroll = () => {
      scrollY.current = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [visible]);

  const id = activeId ?? keptId;
  if (!id) return null;
  return (
    <div hidden={!visible} inert={!visible} data-testid="kept-dashboard">
      <DashboardPage dashboardId={id} hiddenView={!visible} />
    </div>
  );
}

/** Authenticated app shell: nav header + realtime socket connection, per docs/Architecture.md §9. */
export function AppShell() {
  return (
    <SocketProvider>
      <div className="bg-background min-h-svh">
        <a
          href="#main"
          className="bg-primary text-primary-foreground sr-only fixed top-2 left-3 z-100 rounded-md px-3 py-2 focus:not-sr-only"
        >
          Skip to content
        </a>
        <ShellHeader />
        <ConnectionBanner />
        <main id="main" tabIndex={-1} className="px-4 pt-4 pb-10 focus:outline-none md:px-6 md:pt-5 md:pb-12">
          <KeptDashboard />
          <Outlet />
        </main>
      </div>
    </SocketProvider>
  );
}
