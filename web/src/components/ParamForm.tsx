import type { ParamSpec } from '@dashboard/shared';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';

export type ParamValues = Record<string, string>;

/** Returns an error message for one param's raw string value, or null when it is valid. */
export function validateParam(spec: ParamSpec, raw: string): string | null {
  if (raw === '') return spec.required ? 'Required' : null;
  if (spec.enum) return spec.enum.includes(raw) ? null : 'Pick one of the listed values';
  if (spec.type === 'integer') {
    const n = Number(raw);
    if (!Number.isInteger(n)) return 'Must be a whole number';
    if (spec.min !== undefined && n < spec.min) return `Must be at least ${spec.min}`;
    if (spec.max !== undefined && n > spec.max) return `Must be at most ${spec.max}`;
    return null;
  }
  if (spec.pattern && !new RegExp(spec.pattern).test(raw)) return `Must match ${spec.pattern}`;
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

interface ParamFormProps {
  specs: ParamSpec[];
  values: ParamValues;
  onChange: (values: ParamValues) => void;
}

/** Form generated from a widget's ParamSpec[]: enum → select, integer → bounded number, string → pattern-checked text. */
export function ParamForm({ specs, values, onChange }: ParamFormProps) {
  if (specs.length === 0) return <p className="text-muted-foreground text-sm">This widget has no parameters.</p>;

  return (
    <div className="grid gap-3">
      {specs.map((spec) => {
        const id = `param-${spec.name}`;
        const value = values[spec.name] ?? '';
        const error = value === '' ? null : validateParam(spec, value);
        const set = (v: string) => onChange({ ...values, [spec.name]: v });
        return (
          <div key={spec.name} className="grid gap-1.5">
            <Label htmlFor={id}>{spec.label ?? spec.name}</Label>
            {spec.enum ? (
              <select
                id={id}
                value={value}
                onChange={(e) => set(e.target.value)}
                className="border-input bg-background focus-visible:ring-ring/50 h-9 rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
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
                min={spec.min}
                max={spec.max}
                value={value}
                aria-invalid={error !== null}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(e) => set(e.target.value)}
              />
            )}
            {error && (
              <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
