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
