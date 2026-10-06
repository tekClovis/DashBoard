import type { DashboardEntry } from '@dashboard/shared';
import { Check, ChevronDown, Inbox, LayoutGrid, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMatch, useNavigate } from 'react-router';
import {
  useCreateDashboard,
  useDashboards,
  useDeleteDashboard,
  useRenameDashboard,
} from '@/api/dashboards.js';
import { useIncomingShares } from '@/api/shares.js';
import { IncomingSharesDialog, ShareDialog } from '@/components/DashboardShare.js';
import { FieldError } from '@/components/ParamForm.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Skeleton } from '@/components/ui/skeleton.js';

const MAX_NAME = 100;

type Dialogs = { kind: 'create' } | { kind: 'rename'; dashboard: DashboardEntry } | { kind: 'delete'; dashboard: DashboardEntry } | { kind: 'only'; dashboard: DashboardEntry } | { kind: 'share'; dashboard: DashboardEntry } | { kind: 'inbox' };

function NameDialog({
  dialog,
  dashboards,
  onClose,
}: {
  dialog: { kind: 'create' } | { kind: 'rename'; dashboard: DashboardEntry };
  dashboards: DashboardEntry[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const create = useCreateDashboard();
  const rename = useRenameDashboard();
  const renaming = dialog.kind === 'rename';
  const [name, setName] = useState(renaming ? dialog.dashboard.name : '');
  const [error, setError] = useState<string | null>(null);
  const mutation = renaming ? rename : create;

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const own = renaming ? dialog.dashboard.id : undefined;
    if (!trimmed) return setError('Enter a name.');
    if (dashboards.some((d) => d.id !== own && d.name.toLowerCase() === trimmed.toLowerCase()))
      return setError('You already have a dashboard with this name.');
    setError(null);
    if (renaming) rename.mutate({ id: dialog.dashboard.id, name: trimmed }, { onSuccess: onClose });
    else
      create.mutate(trimmed, {
        onSuccess: (created) => {
          onClose();
          void navigate(`/d/${created.id}`);
        },
      });
  }

  const shown = error ?? (mutation.isError ? `Couldn’t ${renaming ? 'rename' : 'create'} the dashboard. Try again.` : null);

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <div>
        <DialogTitle className="text-base font-semibold">{renaming ? 'Rename dashboard' : 'New dashboard'}</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-0.5 text-[0.8125rem]">
          {renaming ? 'Widgets are not affected.' : 'It starts empty. Add widgets after it opens.'}
        </DialogDescription>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="dashboard-name">Name</Label>
        <Input
          id="dashboard-name"
          value={name}
          maxLength={MAX_NAME}
          autoComplete="off"
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? 'dashboard-name-err' : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        {shown && <FieldError id="dashboard-name-err">{shown}</FieldError>}
      </div>
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={mutation.isPending}>
          {renaming ? (rename.isPending ? 'Saving…' : 'Save name') : create.isPending ? 'Creating…' : 'Create dashboard'}
        </Button>
      </div>
    </form>
  );
}

function DeleteDialog({
  dashboard,
  dashboards,
  activeId,
  onClose,
}: {
  dashboard: DashboardEntry;
  dashboards: DashboardEntry[];
  activeId: string | undefined;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const remove = useDeleteDashboard();

  function confirm() {
    const rest = dashboards.filter((d) => d.id !== dashboard.id);
    const idx = dashboards.findIndex((d) => d.id === dashboard.id);
    remove.mutate(dashboard.id, {
      onSuccess: () => {
        onClose();
        if (activeId === dashboard.id) void navigate(`/d/${rest[Math.max(0, idx - 1)].id}`);
      },
    });
  }

  return (
    <div className="grid gap-4">
      <div>
        <DialogTitle className="text-base font-semibold">Delete “{dashboard.name}”?</DialogTitle>
        <DialogDescription className="text-muted-foreground mt-0.5 text-[0.8125rem]">
          This removes the dashboard and its widgets. This can’t be undone.
        </DialogDescription>
      </div>
      {remove.isError && <FieldError id="dashboard-delete-err">Couldn’t delete the dashboard. Try again.</FieldError>}
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="outline" autoFocus>
            Cancel
          </Button>
        </DialogClose>
        <Button type="button" variant="destructive-solid" disabled={remove.isPending} onClick={confirm}>
          {remove.isPending ? 'Deleting…' : 'Delete dashboard'}
        </Button>
      </div>
    </div>
  );
}

/** Topbar dashboard list: switch (URL /d/<id>), create, rename and delete. */
export function DashboardSwitcher() {
  const { data, isPending, isError, refetch } = useDashboards();
  const activeId = useMatch('/d/:dashboardId')?.params.dashboardId;
  const navigate = useNavigate();
  const incomingCount = useIncomingShares().data?.shares.length ?? 0;
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dashboards = data?.dashboards ?? [];
  const current = dashboards.find((d) => d.id === activeId);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = isPending ? 'Loading…' : (current?.name ?? 'Dashboards');
  const openDialog = (next: Dialogs) => {
    setOpen(false);
    setDialog(next);
  };

  return (
    <div ref={rootRef} className="md:relative">
      <Button
        variant="outline"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="dashboard-switcher"
        aria-label={`Switch dashboard, current: ${label}`}
        onClick={() => setOpen((o) => !o)}
        className="max-w-48"
      >
        <LayoutGrid className="size-3.5" strokeWidth={1.75} aria-hidden />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5" strokeWidth={1.75} aria-hidden />
      </Button>
      {open && (
        <div
          id="dashboard-switcher"
          role="dialog"
          aria-label="Dashboards"
          className="bg-popover text-popover-foreground fixed inset-x-2 top-13 z-40 rounded-md md:absolute md:inset-x-auto md:top-[calc(100%+4px)] md:left-0 md:w-64 border p-1 shadow-[0_8px_24px_-8px_oklch(0_0_0/35%)]"
        >
          <div className="text-muted-foreground px-2 pt-2 pb-1 text-xs">Your dashboards</div>
          {isPending && (
            <div aria-busy="true" className="grid gap-2 p-2">
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          )}
          {isError && (
            <div className="grid gap-2 p-2 text-[0.8125rem]">
              <p className="text-destructive">Couldn’t load your dashboards</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          )}
          {data && (
            <ul role="list">
              {dashboards.map((d) => (
                <li key={d.id} className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-current={d.id === activeId ? 'page' : undefined}
                    onClick={() => {
                      setOpen(false);
                      void navigate(`/d/${d.id}`);
                    }}
                    className="hover:bg-accent aria-[current=page]:bg-accent flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left text-[0.8125rem] aria-[current=page]:font-semibold"
                  >
                    {d.id === activeId ? <Check className="size-3.5" aria-hidden /> : <span className="size-3.5" />}
                    <span className="truncate">{d.name}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Rename ${d.name}`}
                    onClick={() => openDialog({ kind: 'rename', dashboard: d })}
                  >
                    <Pencil className="size-3.5" strokeWidth={1.75} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Share ${d.name}`}
                    onClick={() => openDialog({ kind: 'share', dashboard: d })}
                  >
                    <Share2 className="size-3.5" strokeWidth={1.75} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${d.name}`}
                    aria-disabled={dashboards.length === 1 || undefined}
                    title={dashboards.length === 1 ? 'This is your only dashboard' : undefined}
                    onClick={() => openDialog({ kind: dashboards.length === 1 ? 'only' : 'delete', dashboard: d })}
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.75} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 border-t pt-1">
            <button
              type="button"
              disabled={!data}
              onClick={() => openDialog({ kind: 'create' })}
              className="hover:bg-accent flex h-8 w-full items-center gap-2 rounded-sm px-2 text-[0.8125rem] disabled:opacity-45"
            >
              <Plus className="size-3.5" strokeWidth={1.75} aria-hidden />
              New dashboard
            </button>
            <button
              type="button"
              onClick={() => openDialog({ kind: 'inbox' })}
              className="hover:bg-accent flex h-8 w-full items-center gap-2 rounded-sm px-2 text-[0.8125rem]"
            >
              <Inbox className="size-3.5" strokeWidth={1.75} aria-hidden />
              Shared with you
              {incomingCount > 0 && (
                <span className="bg-primary text-primary-foreground ml-auto rounded-sm px-1.5 font-mono text-[0.6875rem]">
                  {incomingCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="w-[min(420px,calc(100vw-2rem))]">
          {dialog?.kind === 'only' ? (
            <div className="grid gap-4">
              <div>
                <DialogTitle className="text-base font-semibold">This is your only dashboard</DialogTitle>
                <DialogDescription className="text-muted-foreground mt-0.5 text-[0.8125rem]">
                  You need at least one dashboard, so it can’t be deleted. Rename it or create another one first.
                </DialogDescription>
              </div>
              <div className="flex justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Close
                  </Button>
                </DialogClose>
              </div>
            </div>
          ) : dialog?.kind === 'delete' ? (
            <DeleteDialog
              dashboard={dialog.dashboard}
              dashboards={dashboards}
              activeId={activeId}
              onClose={() => setDialog(null)}
            />
          ) : dialog?.kind === 'share' ? (
            <ShareDialog dashboard={dialog.dashboard} />
          ) : dialog?.kind === 'inbox' ? (
            <IncomingSharesDialog onClose={() => setDialog(null)} />
          ) : (
            dialog && <NameDialog dialog={dialog} dashboards={dashboards} onClose={() => setDialog(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
