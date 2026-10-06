import type { ParamSpec } from '@dashboard/shared';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input.js';
import { SearchPicker } from '@/components/SearchPicker.js';
import { Label } from '@/components/ui/label.js';
import { cn } from '@/lib/utils.js';

export type ParamValues = Record<string, string>;

/** Returns an error message for one param's raw string value, or null when it is valid. */
export function validateParam(spec: ParamSpec, raw: string): string | null {
  if (raw === '') return spec.required ? (spec.search ? 'Pick one of the search results to continue.' : 'Required.') : null;
  if (spec.enum) return spec.enum.includes(raw) ? null : 'Pick one of the listed values.';
  if (spec.type === 'integer') {
    const n = Number(raw);
    if (!Number.isInteger(n)) return 'Enter a whole number.';
    if (spec.min !== undefined && spec.max !== undefined && (n < spec.min || n > spec.max))
      return `Enter a number from ${spec.min} to ${spec.max}.`;
    if (spec.min !== undefined && n < spec.min) return `Enter ${spec.min} or more.`;
    if (spec.max !== undefined && n > spec.max) return `Enter ${spec.max} or less.`;
    return null;
  }
  if (spec.pattern && !new RegExp(spec.pattern).test(raw))
    return spec.name === 'repo' ? 'Use owner/name, with no spaces.' : 'This value isn’t in the expected format.';
  return null;
}

export function validateParams(specs: ParamSpec[], values: ParamValues): boolean {
  return specs.every((s) => validateParam(s, values[s.name] ?? '') === null);
}

/** Typed params for the API: integers as numbers, empty optionals omitted. */
export function toParams(specs: ParamSpec[], values: ParamValues): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const s of specs) {
    const raw = values[s.name] ?? '';
    if (raw !== '') out[s.name] = s.type === 'integer' ? Number(raw) : raw;
  }
  return out;
}

/** Initial string values: instance params when reconfiguring, otherwise each spec's default. */
export function initialValues(specs: ParamSpec[], current?: Record<string, string | number>): ParamValues {
  return Object.fromEntries(specs.map((s) => [s.name, String(current?.[s.name] ?? s.default ?? '')]));
}

/** Inline field error under a control, referenced by the control's aria-describedby. */
export function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p id={id} className="text-destructive flex items-start gap-1.5 text-xs">
      <CircleAlert className="mt-px size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      {children}
    </p>
  );
}

/** Display-only extras the catalog doesn't carry: a usage hint and monospace for identifier-like values. */
const PARAM_UI: Record<string, { hint?: string; mono?: true }> = {
  repo: { hint: 'owner/name, for example acme/telemetry', mono: true },
  app_id: { hint: 'The number in the game’s store URL, for example 730', mono: true },
  region: { mono: true },
};

interface ParamFormProps {
  specs: ParamSpec[];
  values: ParamValues;
  onChange: (values: ParamValues) => void;
  /** Show every field's error (after a blocked Next), not only the ones already left. */
  showErrors?: boolean;
  /** Titles of the results picked in `search` params, by param name; kept by the caller across steps. */
  titles?: Record<string, string>;
  onTitleChange?: (name: string, title: string | undefined) => void;
}

/**
 * Form generated from a widget's ParamSpec[]: enum → select, integer → bounded number, string → pattern-checked text.
 * A field's error appears once it is left non-empty (or `showErrors`), then follows each keystroke.
 */
export function ParamForm({ specs, values, onChange, showErrors = false, titles, onTitleChange }: ParamFormProps) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  if (specs.length === 0) return <p className="text-muted-foreground">This widget has no settings.</p>;

  return specs.map((spec) => {
    const id = `param-${spec.name}`;
    const value = values[spec.name] ?? '';
    const error = showErrors || touched[spec.name] ? validateParam(spec, value) : null;
    const ui = PARAM_UI[spec.name];
    const hint = ui?.hint ?? (spec.type === 'integer' && spec.max !== undefined ? `${spec.min} to ${spec.max}` : '');
    const describedBy = [hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(' ') || undefined;
    const set = (v: string) => onChange({ ...values, [spec.name]: v });
    return (
      <div key={spec.name} className="grid gap-1.5">
        <Label htmlFor={id} className="block leading-normal">
          {spec.label ?? spec.name}
          {!spec.required && <span className="text-muted-foreground font-normal"> (optional)</span>}
        </Label>
        {hint && (
          <span id={`${id}-hint`} className="text-muted-foreground text-xs">
            {hint}
          </span>
        )}
        {spec.search ? (
          <SearchPicker
            id={id}
            endpoint={spec.search}
            noun={(spec.label ?? spec.name).toLowerCase()}
            value={value}
            onChange={set}
            savedTitle={titles?.[spec.name]}
            onPick={(r) => onTitleChange?.(spec.name, r?.title)}
            describedBy={describedBy}
            invalid={!!error}
          />
        ) : spec.enum ? (
          <select
            id={id}
            value={value}
            aria-describedby={describedBy}
            onChange={(e) => set(e.target.value)}
            className="border-input dark:bg-input/12 focus-visible:border-ring focus-visible:outline-ring h-10 w-full rounded-md border bg-transparent px-2.5 text-base focus-visible:outline-2 focus-visible:outline-offset-1 md:h-8 md:text-sm"
          >
            {!spec.required && <option value="" />}
            {spec.enum.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id={id}
            type={spec.type === 'integer' ? 'number' : 'text'}
            inputMode={spec.type === 'integer' ? 'numeric' : 'text'}
            min={spec.min}
            max={spec.max}
            required={spec.required}
            value={value}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => set(e.target.value)}
            onBlur={() => value !== '' && setTouched((t) => ({ ...t, [spec.name]: true }))}
            className={cn(ui?.mono && 'font-mono md:text-[0.8125rem]', spec.type === 'integer' && 'max-w-[140px]')}
          />
        )}
        {error && <FieldError id={`${id}-err`}>{error}</FieldError>}
      </div>
    );
  });
}
