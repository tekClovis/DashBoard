// Placeholder build until the Vite/React SPA lands (docs/Architecture.md build order step 3).
// Writes just enough of dist/ for @nestjs/serve-static to have something to serve.
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
writeFileSync(
  'dist/index.html',
  '<!doctype html><html><head><meta charset="utf-8"><title>Dashboard</title></head>' +
    '<body><p>Frontend not built yet.</p></body></html>\n',
);
