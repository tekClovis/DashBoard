import { Navigate } from 'react-router';
import { useMe } from '@/api/auth.js';
import { useDashboards } from '@/api/dashboards.js';

/** `/`: unauthenticated goes to /login, authenticated goes to their first dashboard. */
export function RootRedirect() {
  const { data: me, isPending: mePending } = useMe();
  const { data: dashboards, isPending: dashboardsPending } = useDashboards({ enabled: !!me });

  if (mePending) return <div className="text-muted-foreground p-8">Loading…</div>;
  if (!me) return <Navigate to="/login" replace />;
  if (dashboardsPending) return <div className="text-muted-foreground p-8">Loading…</div>;

  return <Navigate to={`/d/${dashboards?.dashboards[0]?.id ?? 'placeholder'}`} replace />;
}
