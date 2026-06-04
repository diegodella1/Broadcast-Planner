import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration for Cloudflare D1 (SQLite).
 *
 * Usage:
 *   npx drizzle-kit generate          # emit SQLite migration SQL into ./drizzle/
 *   wrangler d1 migrations apply DB   # apply migrations to D1 (dev or prod)
 *
 * No live DB credentials are configured here; drizzle-kit generate works
 * purely from the TypeScript schema. Applying migrations is done via wrangler.
 */
export default defineConfig({
    dialect: 'sqlite',
    schema: './lib/db/schema.ts',
    out: './drizzle',
    // driver is not set — drizzle-kit generate for SQLite/D1 needs no driver
});
