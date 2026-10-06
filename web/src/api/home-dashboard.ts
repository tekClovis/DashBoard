import { useEffect } from 'react';
import { useCreateDashboard, useDashboards } from './dashboards.js';

export const DEFAULT_DASHBOARD_NAME = 'My Dashboard';

/** The user's first dashboard id, creating a default one when they have none. `undefined` while loading/creating. */
export function useHomeDashboardId(enabled: boolean): string | undefined {
  const { data, isPending } = useDashboards({ enabled });
  const create = useCreateDashboard();
  const empty = enabled && !isPending && data?.dashboards.length === 0;

  useEffect(() => {
    if (empty && create.isIdle) create.mutate(DEFAULT_DASHBOARD_NAME);
  }, [empty, create]);

  return data?.dashboards[0]?.id ?? create.data?.id;
}
