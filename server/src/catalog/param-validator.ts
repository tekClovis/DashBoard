// Reusable ParamSpec[] validation — owned here since catalog owns the ParamSpec shape.
// Called by dashboards-api on widget-instance create/update. See features/catalog-api/spec.md
// and docs/Architecture.md §8 ("Widget params are validated against the registry's ParamSpecs").

import type { ParamSpec } from '@dashboard/shared';

export type ValidatedParams = Record<string, string | number>;

export interface ParamValidationError {
  param: string;
  message: string;
}

export type ParamValidationResult =
  | { ok: true; params: ValidatedParams }
  | { ok: false; error: ParamValidationError };

/**
 * Validates a raw params object against a widget's ParamSpec[]: type, `required`, `enum`
 * membership, integer `min`/`max`, and string `pattern`. Returns coerced values (e.g. a numeric
 * string becomes a `number` for `type: 'integer'`) or the first validation failure, identified by
 * param name. Keys in `raw` that aren't declared in `specs` are dropped, never passed through.
 */
function fail(param: string, message: string): ParamValidationResult {
  return { ok: false, error: { param, message } };
}

export function validateParams(specs: ParamSpec[], raw: Record<string, unknown>): ParamValidationResult {
  const params: ValidatedParams = {};

  for (const spec of specs) {
    const value = raw[spec.name];

    if (value === undefined || value === null || value === '') {
      if (spec.required) {
        return fail(spec.name, `'${spec.name}' is required`);
      }
      if (spec.default !== undefined) {
        params[spec.name] = spec.default;
      }
      continue;
    }

    if (spec.type === 'integer') {
      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isInteger(num)) {
        return fail(spec.name, `'${spec.name}' must be an integer`);
      }
      if (spec.min !== undefined && num < spec.min) {
        return fail(spec.name, `'${spec.name}' must be >= ${spec.min}`);
      }
      if (spec.max !== undefined && num > spec.max) {
        return fail(spec.name, `'${spec.name}' must be <= ${spec.max}`);
      }
      params[spec.name] = num;
      continue;
    }

    if (typeof value !== 'string' && typeof value !== 'number') {
      return fail(spec.name, `'${spec.name}' must be a string`);
    }
    const str = String(value);
    if (spec.enum && !spec.enum.includes(str)) {
      return fail(spec.name, `'${spec.name}' must be one of: ${spec.enum.join(', ')}`);
    }
    if (spec.pattern && !new RegExp(spec.pattern).test(str)) {
      return fail(spec.name, `'${spec.name}' does not match the required pattern`);
    }
    params[spec.name] = str;
  }

  return { ok: true, params };
}
