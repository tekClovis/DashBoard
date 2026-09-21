import { Navigate, Outlet } from 'react-router';
import { useMe } from '@/api/auth.js';
import { useDashboards } from '@/api/dashboards.js';

/** Wraps /login and /register: an already-authenticated user is sent to their first dashboard. */
export function RedirectIfAuthed() {
  const { data: me, isPending: mePending, isError: meError } = useMe();
  const { data: dashboards, isPending: dashboardsPending } = useDashboards({ enabled: !!me && !meError });

  if (mePending) return <div className="text-muted-foreground p-8">Loading…</div>;
  if (!me || meError) return <Outlet />;
  if (dashboardsPending) return <div className="text-muted-foreground p-8">Loading…</div>;

  const homeId = dashboards?.dashboards[0]?.id ?? 'placeholder';
  return <Navigate to={`/d/${homeId}`} replace />;
}
