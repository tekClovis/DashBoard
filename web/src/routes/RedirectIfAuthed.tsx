import { Navigate, Outlet } from 'react-router';
import { useMe } from '@/api/auth.js';
import { useHomeDashboardId } from '@/api/home-dashboard.js';

/** Wraps /login and /register: an already-authenticated user is sent to their first dashboard. */
export function RedirectIfAuthed() {
  const { data: me, isPending: mePending, isError: meError } = useMe();
  const homeId = useHomeDashboardId(!!me && !meError);

  if (mePending) return <div className="text-muted-foreground p-8">Loading…</div>;
  if (!me || meError) return <Outlet />;
  if (!homeId) return <div className="text-muted-foreground p-8">Loading…</div>;

  return <Navigate to={`/d/${homeId}`} replace />;
}
