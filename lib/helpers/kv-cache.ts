import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Minimal KVNamespace shape used by this helper. Declared locally to avoid
 * pulling in the full `@cloudflare/workers-types` package. The OpenNext
 * adapter exposes the binding at runtime; we only consume `get` + `put`.
 */
interface KvLike {
    get(key: string, type: 'json'): Promise<unknown>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface SlideDataEnv {
    SLIDE_DATA_KV?: KvLike;
}

export type CachedFetcher<T> = () => Promise<T>;

const MINIMUM_KV_TTL_SECONDS = 60;

/**
 * Wrap a fetcher with Cloudflare Workers KV caching.
 *
 * Behaviour:
 * - On a Worker request with the `SLIDE_DATA_KV` binding bound, reads the
 *   cached JSON value first and returns it on hit.
 * - On miss (or any KV error), executes the fetcher, persists the fresh
 *   value with the requested `expirationTtl`, then returns the fresh value.
 * - Outside Workers (local `next dev`, vitest, build-time prerender) the
 *   binding is unavailable; the helper transparently falls back to the
 *   fetcher with no caching.
 *
 * The fetcher MUST return a JSON-serialisable value; the helper round-trips
 * the result through `JSON.stringify` / `KV.get(key, 'json')`.
 */
export async function withKvCache<T>(
    key: string,
    ttlSeconds: number,
    fetcher: CachedFetcher<T>,
): Promise<T> {
    const kv = await resolveKv();

    if (!kv) {
        return fetcher();
    }

    try {
        const cached = await kv.get(key, 'json');

        if (cached !== null && cached !== undefined) {
            return cached as T;
        }
    } catch (error) {
        console.warn(`[kv-cache] read failed for "${key}"`, error);

        return fetcher();
    }

    const fresh = await fetcher();

    try {
        await kv.put(key, JSON.stringify(fresh), {
            expirationTtl: Math.max(ttlSeconds, MINIMUM_KV_TTL_SECONDS),
        });
    } catch (error) {
        console.warn(`[kv-cache] write failed for "${key}"`, error);
    }

    return fresh;
}

async function resolveKv(): Promise<KvLike | null> {
    try {
        const ctx = await getCloudflareContext({ async: true });
        const env = ctx.env as unknown as SlideDataEnv;

        return env.SLIDE_DATA_KV ?? null;
    } catch {
        return null;
    }
}
