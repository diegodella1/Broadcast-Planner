/**
 * scripts/seed-d1-operator.ts
 *
 * Inserts one admin operator into the local D1 database for dev login.
 *
 * Usage:
 *   SEED_OPERATOR_HANDLE=admin SEED_OPERATOR_TOKEN=changeme \
 *     ./node_modules/.bin/tsx scripts/seed-d1-operator.ts
 *
 * The script computes the SHA-256 token hash using the same algorithm as
 * lib/auth/auth.ts#hashSecret, then shells out to wrangler d1 execute so
 * you don't need a running Workers runtime.
 *
 * Prerequisites:
 *   - wrangler must be authenticated (wrangler login or CLOUDFLARE_API_TOKEN set)
 *   - The local D1 database must exist (run `wrangler d1 migrations apply DB --local` first)
 *
 * Do NOT invoke via npx — it is aliased to npm in this environment.
 * Always call the binary directly:
 *   ./node_modules/.bin/tsx scripts/seed-d1-operator.ts
 */

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const handle = process.env.SEED_OPERATOR_HANDLE;
const token = process.env.SEED_OPERATOR_TOKEN;

if (!handle || !token) {
    console.error(
        'Error: SEED_OPERATOR_HANDLE and SEED_OPERATOR_TOKEN must be set.\n' +
            '  SEED_OPERATOR_HANDLE=admin SEED_OPERATOR_TOKEN=changeme ./node_modules/.bin/tsx scripts/seed-d1-operator.ts',
    );
    process.exit(1);
}

function hashSecret(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

const tokenHash = hashSecret(token);
const now = new Date().toISOString();
const id = crypto.randomUUID();

const sql =
    `INSERT OR REPLACE INTO admin_operators (id, handle, token_hash, role, created_at, updated_at) ` +
    `VALUES ('${id}', '${handle}', '${tokenHash}', 'admin', '${now}', '${now}')`;

console.log(`Seeding operator "${handle}" into local D1…`);
console.log(`  token_hash: ${tokenHash}`);

try {
    execSync(
        `./node_modules/.bin/wrangler d1 execute DB --local --command "${sql.replace(/"/g, '\\"')}"`,
        { stdio: 'inherit' },
    );
    console.log(`Done. You can now log in with handle="${handle}" and the token you set.`);
} catch (err) {
    console.error('wrangler d1 execute failed:', err);
    process.exit(1);
}
