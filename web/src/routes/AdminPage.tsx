import type { AdminUserEntry } from '@dashboard/shared';
import { ChevronLeft, ChevronRight, OctagonX, Search } from 'lucide-react';
import { useId, useRef, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router';
import { useAdminUsers, useDeleteAdminUser, useUpdateAdminUser } from '@/api/admin.js';
import { useMe } from '@/api/auth.js';
import { ApiError } from '@/api/client.js';
import { PageHead } from '@/components/page-head.js';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Lamp } from '@/components/ui/lamp.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';

const PAGE_SIZE = 8;

const ERROR_MESSAGES: Record<string, string> = {
  CANNOT_MODIFY_SELF: "You can't ban, demote or delete your own account.",
  USER_NOT_FOUND: 'That user no longer exists.',
};

function describeError(err: unknown): string {
  if (err instanceof ApiError) return ERROR_MESSAGES[err.code] ?? `Request failed (${err.status}).`;
  return 'Request failed.';
}

const found = (n: number) => `${n} ${n === 1 ? 'user' : 'users'} found.`;
const matching = (users: AdminUserEntry[], q: string) => {
  const needle = q.trim().toLowerCase();
  return needle ? users.filter((u) => u.email.toLowerCase().includes(needle)) : users;
};

/** Matches mocks/index.html#screen=admin. Client gate is UX only — every /api/admin/* route enforces ADMIN server-side. */
export function AdminPage() {
  const { data: me } = useMe();

  if (!me) return null;
  if (me.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-[640px]">
        <PageHead title="Admin" />
        <Alert tone="destructive">
          <OctagonX strokeWidth={1.75} aria-hidden />
          <AlertContent>
            <AlertTitle>Admins only</AlertTitle>
            <AlertDescription>You need the admin role to manage users.</AlertDescription>
            <Button asChild variant="link" className="mt-1.5 justify-self-start">
              <Link to="/">Back to dashboard</Link>
            </Button>
          </AlertContent>
        </Alert>
      </div>
    );
  }
  return <UserTable selfId={me.id} />;
}

function UserTable({ selfId }: { selfId: string }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<AdminUserEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState('');
  const users = useAdminUsers();
  const update = useUpdateAdminUser();
  const remove = useDeleteAdminUser();
  const searchRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const noteId = useId();

  const all = users.data ?? [];
  const matches = matching(all, q);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  // Clamped on read, so deleting the last row of the last page steps back a page.
  const current = Math.min(page, pages);
  const from = (current - 1) * PAGE_SIZE;
  const rows = matches.slice(from, from + PAGE_SIZE);
  const busyId = update.isPending ? update.variables?.id : remove.isPending ? remove.variables : undefined;

  const callbacks = (success: string) => ({
    onMutate: () => setError(null),
    onSuccess: () => setSaid(success),
    onError: (e: unknown) => setError(describeError(e)),
  });

  const actions: RowActionHandlers = {
    onBan: (u) =>
      update.mutate(
        { id: u.id, patch: { bannedAt: u.bannedAt ? null : new Date().toISOString() } },
        callbacks(`${u.email} ${u.bannedAt ? 'unbanned' : 'banned'}.`),
      ),
    onRole: (u) =>
      update.mutate(
        { id: u.id, patch: { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' } },
        callbacks(`${u.email} is now ${u.role === 'ADMIN' ? 'a user' : 'an admin'}.`),
      ),
    onDelete: (u, trigger) => {
      returnFocusRef.current = trigger;
      setPendingDelete(u);
    },
  };

  function confirmDelete() {
    if (!pendingDelete) return;
    remove.mutate(pendingDelete.id, callbacks(`${pendingDelete.email} deleted.`));
    // Cancel returns focus to the row's Delete; after a delete that row is gone.
    returnFocusRef.current = searchRef.current;
    setPendingDelete(null);
  }

  const rowProps = (u: AdminUserEntry) => ({
    user: u,
    self: u.id === selfId,
    busy: busyId === u.id,
    noteId,
    ...actions,
  });

  return (
    <div className="mx-auto max-w-[1040px]">
      <PageHead
        title="Admin"
        sub={
          users.isSuccess ? (
            <>
              <span className="font-mono text-xs">{all.length}</span> user accounts. Changes apply immediately.
            </>
          ) : (
            'User accounts. Changes apply immediately.'
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full md:w-[280px]">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            ref={searchRef}
            className="pl-8"
            type="search"
            aria-label="Search users by email"
            placeholder="Search by email"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
              setSaid(found(matching(all, e.target.value).length));
            }}
          />
        </div>
        <p id={noteId} className="text-muted-foreground text-xs">
          You can’t ban, demote or delete your own account.
        </p>
      </div>
      <p role="status" className="sr-only">
        {said}
      </p>
      {error && (
        <Alert tone="destructive" className="mb-3">
          <OctagonX strokeWidth={1.75} aria-hidden />
          <AlertContent>{error}</AlertContent>
        </Alert>
      )}

      <Card className="overflow-hidden">
        {users.isError ? (
          <div className="p-4">
            <Alert tone="destructive">
              <OctagonX strokeWidth={1.75} aria-hidden />
              <AlertContent>
                <AlertTitle>Couldn’t load users</AlertTitle>
                <AlertDescription>The server returned an error.</AlertDescription>
              </AlertContent>
              <Button variant="outline" size="sm" onClick={() => void users.refetch()}>
                Retry
              </Button>
            </Alert>
          </div>
        ) : users.isSuccess && rows.length === 0 ? (
          <p className="text-muted-foreground p-4 text-[0.8125rem]">No users match “{q}”.</p>
        ) : (
          <>
            <div className="max-md:hidden">
              <Table aria-busy={users.isPending}>
                <TableCaption className="sr-only">
                  Users, page {current} of {pages}
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Email</TableHead>
                    <TableHead scope="col">Role</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col">Created</TableHead>
                    <TableHead scope="col">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.isPending
                    ? Array.from({ length: PAGE_SIZE }, (_, i) => (
                        <TableRow key={i}>
                          {['w-44', 'w-12', 'w-14', 'w-20', 'ml-auto w-40'].map((w) => (
                            <TableCell key={w}>
                              <Skeleton className={`h-3 ${w}`} />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    : rows.map((u) => <UserRow key={u.id} {...rowProps(u)} />)}
                </TableBody>
              </Table>
            </div>
            <div className="md:hidden" aria-busy={users.isPending}>
              {users.isPending
                ? Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="grid gap-2 border-t px-4 py-3 first:border-t-0">
                      <Skeleton className="h-3 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  ))
                : rows.map((u) => <UserCard key={u.id} {...rowProps(u)} />)}
            </div>
          </>
        )}
        {users.isSuccess && rows.length > 0 && (
          <div className="flex items-center justify-end gap-2 border-t px-3 py-2.5 text-xs">
            <span className="text-muted-foreground font-mono">
              {from + 1}–{from + rows.length} of {matches.length}
            </span>
            <Button
              ref={prevRef}
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={current === 1}
              onClick={() => {
                // As the mock: render, then on reaching page 1 move focus to Next instead of losing it to body.
                flushSync(() => setPage(current - 1));
                if (current - 1 === 1) nextRef.current?.focus();
              }}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <span className="font-mono">
              {current} / {pages}
            </span>
            <Button
              ref={nextRef}
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={current === pages}
              onClick={() => {
                flushSync(() => setPage(current + 1));
                if (current + 1 === pages) prevRef.current?.focus();
              }}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        )}
      </Card>

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent
          role="alertdialog"
          className="w-[min(420px,calc(100vw-2rem))] gap-0 p-0 max-md:top-0 max-md:left-0 max-md:flex max-md:h-dvh max-md:max-h-none max-md:w-screen max-md:translate-x-0 max-md:translate-y-0 max-md:flex-col max-md:rounded-none max-md:border-0"
          onInteractOutside={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            // No Dialog.Trigger here, so Radix has nothing to return focus to: do it by hand.
            e.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <div className="border-b px-4 pt-4 pb-3">
            <DialogTitle className="text-base font-semibold">Delete {pendingDelete?.email}?</DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground flex-1 p-4 text-[0.8125rem]">
            This removes the account, its dashboards, widgets and service connections. It can’t be undone.
          </DialogDescription>
          <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive-solid" onClick={confirmDelete}>
              Delete account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface RowActionHandlers {
  onBan: (u: AdminUserEntry) => void;
  onRole: (u: AdminUserEntry) => void;
  onDelete: (u: AdminUserEntry, trigger: HTMLButtonElement) => void;
}

interface RowProps extends RowActionHandlers {
  user: AdminUserEntry;
  self: boolean;
  busy: boolean;
  noteId: string;
}

function UserRow(props: RowProps) {
  const { user: u, self } = props;
  return (
    <TableRow>
      <TableCell>
        {u.email}
        {self && <Badge className="ml-1.5">You</Badge>}
      </TableCell>
      <TableCell>
        <RoleBadge role={u.role} />
      </TableCell>
      <TableCell>
        <StatusBadge banned={u.bannedAt !== null} />
      </TableCell>
      <TableCell>
        <Created at={u.createdAt} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <RowActions {...props} />
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Below md the table becomes stacked cards (design-reference Admin). */
function UserCard(props: RowProps) {
  const { user: u, self } = props;
  return (
    <div className="grid gap-2 border-t px-4 py-3 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[0.8125rem]">{u.email}</span>
        {self && <Badge>You</Badge>}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <RoleBadge role={u.role} />
        <StatusBadge banned={u.bannedAt !== null} />
        <Created at={u.createdAt} />
      </div>
      <div className="flex gap-1">
        <RowActions {...props} />
      </div>
    </div>
  );
}

/** Own row: `aria-disabled` (stays focusable) and points at the note; a row mid-request is plain disabled. */
function RowActions({ user: u, self, busy, noteId, onBan, onRole, onDelete }: RowProps) {
  const lock = self ? { 'aria-disabled': true, 'aria-describedby': noteId } : { disabled: busy };
  const act = (fn: RowActionHandlers['onDelete']) => (e: MouseEvent<HTMLButtonElement>) => {
    if (!self) fn(u, e.currentTarget);
  };
  return (
    <>
      <Button variant="ghost" size="sm" {...lock} onClick={act(onBan)}>
        {u.bannedAt ? 'Unban' : 'Ban'}
      </Button>
      <Button variant="ghost" size="sm" {...lock} onClick={act(onRole)}>
        {u.role === 'ADMIN' ? 'Demote' : 'Promote'}
      </Button>
      <Button variant="ghost" size="sm" className="text-destructive" {...lock} onClick={act(onDelete)}>
        Delete
      </Button>
    </>
  );
}

function RoleBadge({ role }: { role: AdminUserEntry['role'] }) {
  return (
    <Badge variant={role === 'ADMIN' ? 'secondary' : 'default'} className="font-mono font-medium">
      {role}
    </Badge>
  );
}

function StatusBadge({ banned }: { banned: boolean }) {
  return banned ? (
    <Badge variant="destructive">
      <Lamp state="error" />
      Banned
    </Badge>
  ) : (
    <Badge>
      <Lamp state="neutral" />
      Active
    </Badge>
  );
}

function Created({ at }: { at: string }) {
  const day = at.slice(0, 10);
  return (
    <time className="font-mono text-xs" dateTime={day}>
      {day}
    </time>
  );
}
