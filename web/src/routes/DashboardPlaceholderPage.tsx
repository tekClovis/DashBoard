import { Link, useNavigate } from 'react-router';
import { useLogout, useLogoutAll, useMe } from '@/api/auth.js';
import { ThemeToggle } from '@/components/theme-toggle.js';
import { Button } from '@/components/ui/button.js';

export function DashboardPlaceholderPage() {
  const { data } = useMe();
  const logout = useLogout();
  const logoutAll = useLogoutAll();
  const navigate = useNavigate();

  function onLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/login') });
  }

  function onLogoutAll() {
    logoutAll.mutate(undefined, { onSuccess: () => navigate('/login') });
  }

  return (
    <div className="bg-background min-h-svh p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <ThemeToggle />
      </div>
      {data && (
        <>
          <p className="text-muted-foreground mt-4 text-sm">
            Logged in as {data.email} ({data.role})
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Button variant="secondary" disabled={logout.isPending} onClick={onLogout}>
              Log out
            </Button>
            <Button variant="outline" disabled={logoutAll.isPending} onClick={onLogoutAll}>
              Log out of all devices
            </Button>
          </div>
        </>
      )}
      <Link to="/profile" className="text-primary mt-4 block text-sm underline underline-offset-4">
        Linked accounts
      </Link>
    </div>
  );
}
