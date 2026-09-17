// REST request/response shapes — see docs/Architecture.md §3, §8.

import type { ServiceSpec } from './catalog.js';

/** GET /about.json — see docs/Architecture.md §3. */
export interface AboutResponse {
  client: {
    host: string;
  };
  server: {
    current_time: number;
    services: AboutService[];
  };
}

/** Trimmed projection of ServiceSpec/WidgetSpec exposed by the public /about.json. */
export interface AboutService {
  name: string;
  widgets: {
    name: string;
    description: string;
    params: { name: string; type: 'integer' | 'string' }[];
  }[];
}

/** GET /api/catalog — full ParamSpecs plus the caller's connection status per service. */
export interface CatalogResponse {
  services: (ServiceSpec & { connected: boolean })[];
}

/** 8-72 chars, at least one digit and one non-alphanumeric symbol — docs/auth/specs.md §Flows. */
export const PASSWORD_PATTERN = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,72}$/;

/** POST /api/auth/register */
export interface RegisterRequest {
  email: string;
  password: string;
}

/** POST /api/auth/resend */
export interface ResendRequest {
  email: string;
}

/** POST /api/auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Shared success shape for register/confirm/resend/login — see docs/Architecture.md §8. */
export interface OkResponse {
  ok: true;
}

/** GET /api/auth/me */
export interface MeResponse {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  emailVerifiedAt: string | null;
  identities: { provider: 'GITHUB' | 'GOOGLE' }[];
}

/** Client-facing shape of one ServiceConnection — raw tokens never appear here. See docs/Architecture.md §5.2. */
export interface ConnectionEntry {
  service: string;
  connected: boolean;
  status: 'OK' | 'REAUTH';
}

/** GET /api/connections */
export interface ConnectionsResponse {
  connections: ConnectionEntry[];
}
