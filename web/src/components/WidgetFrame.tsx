import type { WidgetInstanceEntry } from '@dashboard/shared';
import { MoreVertical } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import type { MoveDirection } from '@/lib/layout.js';
import { useWidgetData } from '@/realtime/useWidgetData.js';
import { getView } from '@/widgets/registry.js';

const MOVES: { dir: MoveDirection; label: string }[] = [
  { dir: 'up', label: 'Move up' },
  { dir: 'down', label: 'Move down' },
  { dir: 'left', label: 'Move left' },
  { dir: 'right', label: 'Move right' },
];

const RECONNECT_CODES = ['REAUTH_REQUIRED', 'NOT_CONNECTED'];

interface WidgetFrameProps {
  instance: WidgetInstanceEntry;
  onConfigure: () => void;
  onDelete: () => void;
  onMove: (dir: MoveDirection) => void;
}

/** Chrome around one widget instance: title, menu, and loading / error / data body. */
export function WidgetFrame({ instance, onConfigure, onDelete, onMove }: WidgetFrameProps) {
  const { data: entry } = useWidgetData(instance.id);
  const title = `${instance.service}.${instance.widget}`;
  const View = getView(instance.service, instance.widget);

  return (
    <div className="bg-card flex h-full flex-col overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="widget-drag-handle flex-1 text-sm font-medium">{title}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`${title} menu`}>
              <MoreVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onConfigure}>Configure</DropdownMenuItem>
            {MOVES.map(({ dir, label }) => (
              <DropdownMenuItem key={dir} onSelect={() => onMove(dir)}>
                {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={onDelete}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-auto p-3 text-sm">
        {entry?.error && RECONNECT_CODES.includes(entry.error.code) ? (
          <div role="alert" className="grid gap-2">
            <p>Reconnect required: {entry.error.message}</p>
            <Link to="/services" className="text-primary underline">
              Reconnect
            </Link>
          </div>
        ) : entry?.error ? (
          <p role="alert" className="text-destructive">
            Error: {entry.error.message}
          </p>
        ) : !entry?.fetchedAt ? (
          <div data-testid="widget-skeleton" aria-busy="true" className="bg-muted h-full min-h-12 animate-pulse rounded" />
        ) : null}
        {/* Persistent live region scoped to the value only, not the card. */}
        <div aria-live="polite">{entry?.fetchedAt && !entry.error ? <View data={entry.data} /> : null}</div>
      </div>
    </div>
  );
}
