import type { SearchResult } from '@dashboard/shared';
import { Check, CircleAlert, Info, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MIN_SEARCH_LENGTH, useSearch } from '@/api/search.js';
import { Alert, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';

const DEBOUNCE_MS = 300;

interface SearchPickerProps {
  /** Id of the search input, so the field's label and focus handling reach it. */
  id: string;
  /** API path of the search (a ParamSpec's `search`). */
  endpoint: string;
  /** What is searched for, singular and lower-case, e.g. "channel". */
  noun: string;
  /** Saved value: the picked result's id, or '' while nothing is picked. */
  value: string;
  onChange: (id: string) => void;
  describedBy?: string;
  invalid?: boolean;
}

function Avatar({ src, size }: { src?: string; size: number }) {
  return (
    <span
      className="bg-muted relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      {src && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />}
    </span>
  );
}

/**
 * Search-then-pick control for a ParamSpec with `search`: type to list matches (title + avatar), pick one
 * to save its id. Typing again after a pick is not possible until "Change", so the saved id always matches
 * what the user sees.
 */
export function SearchPicker({ id, endpoint, noun, value, onChange, describedBy, invalid }: SearchPickerProps) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<SearchResult | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const search = useSearch(endpoint, query);
  const typed = text.trim();
  const settled = typed === query && query.length >= MIN_SEARCH_LENGTH;
  const results = search.data?.results ?? [];

  // A saved id with no result at hand (reconfiguring a widget) shows the id as its title.
  const picked = value ? (chosen?.id === value ? chosen : { id: value, title: value }) : null;

  if (picked) {
    return (
      <div className="grid gap-1.5">
        <div className="border-foreground grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--foreground)]">
          {picked.thumbnail && <Avatar src={picked.thumbnail} size={40} />}
          <span className="grid min-w-0">
            <b className="truncate text-[0.8125rem] font-[550]">{picked.title}</b>
            <span className="text-muted-foreground truncate font-mono text-[0.6875rem]">{picked.id}</span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setChosen(null);
              setText('');
              setQuery('');
              onChange('');
              // The search input mounts on the next render.
              requestAnimationFrame(() => document.getElementById(id)?.focus());
            }}
          >
            Change
          </Button>
        </div>
        <span role="status" className="text-muted-foreground flex items-center gap-2 text-xs">
          <Check className="size-3.5" aria-hidden />
          {`${noun[0]?.toUpperCase()}${noun.slice(1)} selected. Its ID is saved with the widget.`}
        </span>
      </div>
    );
  }

  const resultsId = `${id}-results`;
  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" aria-hidden />
        <Input
          id={id}
          type="search"
          role="searchbox"
          value={text}
          autoComplete="off"
          spellCheck={false}
          placeholder={`Search by ${noun} name`}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={[describedBy, resultsId].filter(Boolean).join(' ')}
          onChange={(e) => setText(e.target.value)}
          className="pl-8"
        />
      </div>
      <div id={resultsId} aria-live="polite" className="grid gap-1.5">
        {typed.length < MIN_SEARCH_LENGTH && (
          <span className="text-muted-foreground text-xs">{`Type at least ${MIN_SEARCH_LENGTH} letters of a ${noun} name.`}</span>
        )}
        {typed.length >= MIN_SEARCH_LENGTH && (!settled || search.isFetching) && (
          <>
            <span role="status" className="text-muted-foreground text-xs">{`Searching for “${typed}”…`}</span>
            <Skeleton className="h-12 w-full" />
          </>
        )}
        {settled && search.isError && !search.isFetching && (
          <Alert tone="destructive">
            <CircleAlert aria-hidden />
            <AlertContent>
              <AlertTitle>{`Couldn’t search for ${noun}s`}</AlertTitle>
              <AlertDescription>The search didn’t respond (quota or network). Try again in a moment.</AlertDescription>
              <Button type="button" variant="link" size="sm" className="justify-self-start" onClick={() => void search.refetch()}>
                Try again
              </Button>
            </AlertContent>
          </Alert>
        )}
        {settled && search.isSuccess && !search.isFetching && results.length === 0 && (
          <Alert tone="warning">
            <Info aria-hidden />
            <AlertContent>
              <AlertTitle>{`No ${noun}s match “${query}”`}</AlertTitle>
              <AlertDescription>Check the spelling or try a shorter name.</AlertDescription>
            </AlertContent>
          </Alert>
        )}
        {settled && search.isSuccess && !search.isFetching && results.length > 0 && (
          <>
            <span role="status" className="text-muted-foreground text-xs">
              {`${results.length} ${noun}${results.length === 1 ? '' : 's'} found. Pick one.`}
            </span>
            <ul className="border-border divide-border divide-y overflow-hidden rounded-md border">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setChosen(r);
                      onChange(r.id);
                    }}
                    className="hover:bg-accent focus-visible:outline-ring grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-3 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
                  >
                    <Avatar src={r.thumbnail} size={32} />
                    <span className="grid min-w-0">
                      <b className="truncate text-[0.8125rem] font-[550]">{r.title}</b>
                      <span className="text-muted-foreground truncate font-mono text-[0.6875rem]">{r.id}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
