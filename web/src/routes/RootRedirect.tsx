import { Navigate } from 'react-router';
import { useMe } from '@/api/auth.js';
import { useHomeDashboardId } from '@/api/home-dashboard.js';

/** `/`: unauthenticated goes to /login, authenticated goes to their first dashboard. */
export function RootRedirect() {
  const { data: me, isPending: mePending, isError: meError } = useMe();
  const homeId = useHomeDashboardId(!!me && !meError);

  if (mePending) return <div className="text-muted-foreground p-8">Loading…</div>;
  if (!me || meError) return <Navigate to="/login" replace />;
  if (!homeId) return <div className="text-muted-foreground p-8">Loading…</div>;

  return <Navigate to={`/d/${homeId}`} replace />;
}
