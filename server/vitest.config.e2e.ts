import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/testcontainers.ts'],
    // Containers take time to start; e2e-only timeout.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
