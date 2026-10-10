import { defineConfig } from 'prisma/config';

/** Prisma CLI config; `DATABASE_URL` is read from the process environment (not from `.env` files loaded by Nest). */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
