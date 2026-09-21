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
  services: (ServiceSpec & { connected: boolean; status: ConnectionEntry['status'] })[];
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
  /** Whether the user has a local password set (oauth-only users don't). */
  hasPassword: boolean;
  identities: { provider: 'GITHUB' | 'GOOGLE' }[];
}

/** One row of GET /api/admin/users — see docs/Architecture.md §5.3. Never carries credentials. */
export interface AdminUserEntry {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  bannedAt: string | null;
  createdAt: string;
}

/** GET /api/admin/users */
export interface AdminUsersResponse {
  users: AdminUserEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/** PATCH /api/admin/users/{id}. `bannedAt: null` unbans; an ISO date bans. */
export interface AdminUserPatch {
  bannedAt?: string | null;
  role?: 'USER' | 'ADMIN';
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

/** One row of GET /api/dashboards, and the shape returned by dashboard CRUD. */
export interface DashboardEntry {
  id: string;
  name: string;
  position: number;
}

/** GET /api/dashboards */
export interface DashboardsResponse {
  dashboards: DashboardEntry[];
}

/** POST /api/dashboards */
export interface CreateDashboardRequest {
  name: string;
}

/** PATCH /api/dashboards/{id} */
export interface UpdateDashboardRequest {
  name?: string;
  position?: number;
}

/** One WidgetInstance, as returned by dashboards-api's widget-instance endpoints. */
export interface WidgetInstanceEntry {
  id: string;
  dashboardId: string;
  service: string;
  widget: string;
  params: Record<string, string | number>;
  refreshRate: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** POST /api/dashboards/{id}/widgets */
export interface CreateWidgetInstanceRequest {
  service: string;
  widget: string;
  params: Record<string, unknown>;
  refreshRate: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** PATCH /api/widgets/{id} */
export interface UpdateWidgetInstanceRequest {
  params?: Record<string, unknown>;
  refreshRate?: number;
}

/** One entry of PATCH /api/dashboards/{id}/layout's batch body. */
export interface LayoutUpdateEntry {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
