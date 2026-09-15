import { useMe } from '@/api/auth.js';
import { ThemeToggle } from '@/components/theme-toggle.js';

export function DashboardPlaceholderPage() {
  const { data } = useMe();

  return (
    <div className="bg-background min-h-svh p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <ThemeToggle />
      </div>
      {data && (
        <p className="text-muted-foreground mt-4 text-sm">
          Logged in as {data.email} ({data.role})
        </p>
      )}
    </div>
  );
}
