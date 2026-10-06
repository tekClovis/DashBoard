import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Info, RefreshCw, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

function Thumb({ src }: { src?: string }) {
  return src ? <img src={src} alt="" loading="lazy" className="bg-muted h-9 w-[5.5rem] shrink-0 rounded-sm object-cover" /> : null;
}

/** How one candidate (or the chosen one) is shown. */
export interface PickerOption {
  title: string;
  subtitle?: string;
  meta?: string;
  /** Thumbnail URL, shown before the text. */
  image?: string;
}

interface SearchPickerProps<T> {
  /** Id of the search input, so a field's label and error can point at it. */
  id: string;
  /** Scopes cached results to one kind of search. */
  queryKey: string;
  search: (query: string) => Promise<T[]>;
  toOption: (item: T) => PickerOption;
  onPick: (item: T) => void;
  /** The chosen candidate; when set, it replaces the search. */
  picked: PickerOption | null;
  onClear: () => void;
  placeholder?: string;
  /** Singular and plural name of what is searched, for the status copy. */
  nouns: [string, string];
  describedBy?: string;
  invalid?: boolean;
}

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Search input with a listbox of candidates; the chosen one collapses into a chip with a Change button.
 * Reusable for any param whose value is picked from a server search (cities, channels, games).
 */
export function SearchPicker<T>({
  id,
  queryKey,
  search,
  toOption,
  onPick,
  picked,
  onClear,
  placeholder,
  nouns: [singular, plural],
  describedBy,
  invalid,
}: SearchPickerProps<T>) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const hadPicked = useRef(picked !== null);

  const query = text.trim();
  const settled = useDebounced(query, DEBOUNCE_MS);
  const enabled = settled.length >= MIN_QUERY_LENGTH;
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: ['search', queryKey, settled],
    queryFn: () => search(settled),
    enabled,
    retry: false,
  });

  // Focus follows the swap between search and chip, but never on first render.
  const isPicked = picked !== null;
  useEffect(() => {
    if (hadPicked.current === isPicked) return;
    hadPicked.current = isPicked;
    (isPicked ? changeRef : inputRef).current?.focus();
  }, [isPicked]);

  if (picked) {
    return (
      <div className="border-foreground flex items-center gap-3 rounded-md border p-2.5 shadow-[inset_0_0_0_1px_var(--foreground)]">
        <Thumb src={picked.image} />
        <div className="grid min-w-0 gap-0.5">
          <b className="text-sm font-semibold">{picked.title}</b>
          {picked.subtitle && <span className="text-muted-foreground text-xs">{picked.subtitle}</span>}
          {picked.meta && <span className="text-muted-foreground font-mono text-xs">{picked.meta}</span>}
        </div>
        <Button ref={changeRef} type="button" variant="outline" size="sm" className="ml-auto" onClick={onClear}>
          Change
        </Button>
      </div>
    );
  }

  const results = enabled && settled === query && !isFetching && data ? data : [];
  const loading = query.length >= MIN_QUERY_LENGTH && (settled !== query || isFetching) && !isError;
  const showError = enabled && settled === query && !isFetching && isError;
  const showEmpty = enabled && settled === query && !isFetching && !isError && data?.length === 0;
  const helpId = `${id}-help`;

  const pick = (item: T) => {
    setText('');
    setActive(-1);
    onPick(item);
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(results[active]);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
          aria-hidden
        />
        <Input
          ref={inputRef}
          id={id}
          type="search"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-describedby={[helpId, describedBy].filter(Boolean).join(' ')}
          aria-invalid={invalid ? true : undefined}
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="pl-8"
          onChange={(e) => {
            setText(e.target.value);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {loading && (
        <ul aria-busy="true" aria-label={`Searching ${plural}`} className="bg-popover rounded-md border">
          {[0, 1, 2].map((i) => (
            <li key={i} className="grid gap-1.5 border-t px-2.5 py-2 first:border-t-0">
              <span className="bg-muted h-3 w-[90px] animate-pulse rounded-sm" />
              <span className="bg-muted h-2.5 w-[150px] animate-pulse rounded-sm" />
            </li>
          ))}
        </ul>
      )}

      {results.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-label={`Matching ${plural}`}
          className="bg-popover max-h-[264px] overflow-y-auto rounded-md border"
        >
          {results.map((item, i) => {
            const o = toOption(item);
            return (
              <li
                key={i}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onClick={() => pick(item)}
                className="hover:bg-accent aria-selected:bg-accent aria-selected:shadow-[inset_2px_0_0_var(--foreground)] flex cursor-pointer items-center gap-3 border-t px-2.5 py-2 first:border-t-0"
              >
                <Thumb src={o.image} />
                <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-0.5 max-sm:grid-cols-1">
                <span className="col-start-1 text-[0.8125rem] font-[550]">{o.title}</span>
                {o.subtitle && <span className="text-muted-foreground col-start-1 text-xs">{o.subtitle}</span>}
                {o.meta && (
                  <span className="text-muted-foreground font-mono text-[0.6875rem] sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:self-center">
                    {o.meta}
                  </span>
                )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showError ? (
        <div role="alert" className="text-destructive border-destructive flex flex-wrap items-center gap-2 rounded-md border px-3 py-2.5 text-[0.8125rem]">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          <span id={helpId}>{`${cap(singular)} search is unavailable. Try again in a moment.`}</span>
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => void refetch()}>
            <RefreshCw aria-hidden />
            Retry
          </Button>
        </div>
      ) : showEmpty ? (
        <div id={helpId} className="text-muted-foreground flex items-start gap-2 rounded-md border border-dashed p-3 text-[0.8125rem]">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          <div>
            <b className="text-foreground font-semibold">{`No ${plural} match “${query}”.`}</b>
            <br />
            Check the spelling, or try another {singular}.
          </div>
        </div>
      ) : (
        <span id={helpId} aria-live="polite" className="text-muted-foreground text-xs">
          {loading
            ? 'Searching…'
            : results.length > 0
              ? `${results.length} ${results.length === 1 ? singular : plural}. Pick one.`
              : query.length === 1
                ? `Keep typing: at least ${MIN_QUERY_LENGTH} characters.`
                : `Type a ${singular} name to see matches.`}
        </span>
      )}
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
