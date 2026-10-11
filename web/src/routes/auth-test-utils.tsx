import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { vi } from 'vitest';

export const calls: { url: string; method: string; body?: unknown }[] = [];

/** Stubs fetch: `responses` maps a path prefix (e.g. '/api/auth/login') to [status, body]; /api/oauth/providers defaults to both configured; anything else is 200 {ok:true}. */
export function stubAuthApi(responses: Record<string, [number, unknown]> = {}) {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      // Fetched by every page with OAuth buttons; not what those pages' tests assert on.
      const isProviders = url === '/api/oauth/providers';
      if (!isProviders) calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
      const match = Object.keys(responses).find((prefix) => url.startsWith(prefix));
      const [status, body] = match
        ? responses[match]!
        : isProviders
          ? [200, { github: { configured: true }, google: { configured: true } }]
          : [200, { ok: true }];
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }),
  );
}

/** Any route other than the page under test: shows where navigation landed. */
function OtherRoute() {
  return <p>at {useLocation().pathname}</p>;
}

export function renderAt(path: string, routePath: string, element: ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="*" element={<OtherRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
