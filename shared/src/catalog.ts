// Widget catalog types — see docs/Architecture.md §3.

/** Describes one parameter of a widget, as rendered by the client's generated ParamForm. */
export interface ParamSpec {
  name: string;
  /** The only types /about.json allows. */
  type: 'integer' | 'string';
  required?: boolean;
  default?: string | number;
  /** Rendered as a select. */
  enum?: string[];
  /** Integer bounds. */
  min?: number;
  max?: number;
  /** String regex, e.g. owner/repo. */
  pattern?: string;
  label?: string;
}

/** Public shape of one widget, shared by /about.json and /api/catalog. */
export interface WidgetSpec {
  service: string;
  name: string;
  description: string;
  params: ParamSpec[];
  minRefreshSec: number;
}

/** Public shape of one service, shared by /about.json and /api/catalog. */
export interface ServiceSpec {
  name: string;
  connection: 'none' | 'oauth' | 'openid';
  widgets: WidgetSpec[];
}
