import { Navigate, Outlet, useLocation } from 'react-router';
import { useMe } from '@/api/auth.js';

export function RequireAuth() {
  const { data, isPending, isError } = useMe();
  const location = useLocation();

  if (isPending) {
    return <div className="text-muted-foreground p-8">Loading…</div>;
  }

  if (isError || !data) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
