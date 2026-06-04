import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * Minimal structural type that satisfies drizzle-orm/d1's `drizzle()` first
 * argument without depending on @cloudflare/workers-types at build time.
 * Only the `prepare` method matters for type-checking the drizzle() call;
 * the full binding is available at runtime via the Workers env.
 */
interface D1DatabaseLike {
    prepare(query: string): {
        bind(
            ...values: unknown[]
        ): D1DatabaseLike['prepare'] extends (q: string) => infer R ? R : never;
        first<T = unknown>(colName?: string): Promise<T | null>;
        run(): Promise<{ meta: Record<string, unknown> }>;
        all<T = unknown>(): Promise<{ results: T[] }>;
        raw<T = unknown[]>(): Promise<T[]>;
    };
    exec(query: string): Promise<{ count: number; duration: number }>;
    batch<T = unknown>(
        statements: ReturnType<D1DatabaseLike['prepare']>[],
    ): Promise<{ results: T[] }[]>;
    dump(): Promise<ArrayBuffer>;
}

interface D1Env {
    DB?: D1DatabaseLike;
}

export type DrizzleD1Client = ReturnType<typeof drizzle<typeof schema>>;

/**
 * Return a Drizzle client bound to the D1 `DB` binding.
 *
 * Follows the exact same getCloudflareContext({ async: true }) pattern used
 * by lib/helpers/kv-cache.ts for the SLIDE_DATA_KV binding.
 *
 * Throws if called outside a Cloudflare Workers runtime (e.g. plain Next.js
 * dev server without `wrangler dev`). Callers should guard with try/catch or
 * only invoke from route handlers / server actions that run on Workers.
 */
export async function getDb(): Promise<DrizzleD1Client> {
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx.env as unknown as D1Env;

    if (!env.DB) {
        throw new Error(
            '[lib/db/client] D1 binding "DB" is not available. ' +
                'Ensure the wrangler.jsonc d1_databases binding is configured ' +
                'and you are running inside a Cloudflare Workers context.',
        );
    }

    // Cast through unknown to satisfy drizzle-orm/d1's overloaded signature
    // without depending on the @cloudflare/workers-types global D1Database type.
    return drizzle(env.DB as unknown as Parameters<typeof drizzle>[0], { schema });
}
