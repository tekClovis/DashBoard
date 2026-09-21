import { useMe } from '@/api/auth.js';

/** Routing/gating only — admin-ui builds the real content (features/frontend-shell/spec.md). */
export function AdminPage() {
  const { data: me } = useMe();

  if (me && me.role !== 'ADMIN') {
    return (
      <div className="bg-background min-h-svh p-6">
        <p className="text-destructive text-sm">403 — this page is for admins only.</p>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-svh p-6">
      <h1 className="text-lg font-semibold">Admin</h1>
      <p className="text-muted-foreground mt-2 text-sm">User table placeholder (built by admin-ui).</p>
    </div>
  );
}
