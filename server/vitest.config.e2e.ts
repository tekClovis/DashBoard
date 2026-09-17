import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/testcontainers.ts'],
    // All e2e files share one Postgres/Redis container (see testcontainers.ts) with no
    // per-file namespacing, so concurrent files racing on the same tables corrupt each
    // other's row counts — run e2e files one at a time.
    fileParallelism: false,
    // Containers take time to start; e2e-only timeout.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
