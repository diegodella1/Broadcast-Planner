import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Minimal structural type for an R2 bucket binding — keeps the module free of
 * the @cloudflare/workers-types global dependency, mirroring the pattern used
 * by lib/db/client.ts for the D1DatabaseLike interface.
 *
 * Only the methods actually called in this codebase are declared; the full
 * Workers R2Bucket type is a superset of this interface.
 */
interface R2ObjectBody {
    body: ReadableStream;
    httpMetadata?: { contentType?: string };
    httpEtag: string;
    size: number;
    range?: { offset: number; length: number };
}

interface R2GetOptions {
    range?: { offset?: number; length?: number; suffix?: number };
}

interface R2HeadObject {
    httpMetadata?: { contentType?: string };
    httpEtag: string;
}

interface R2Objects {
    objects: Array<{ key: string }>;
}

interface R2PutOptions {
    httpMetadata?: { contentType?: string };
}

export interface R2BucketLike {
    put(key: string, value: ArrayBuffer | ReadableStream, options?: R2PutOptions): Promise<void>;
    get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
    delete(key: string): Promise<void>;
    head(key: string): Promise<R2HeadObject | null>;
    list(options?: { limit?: number; prefix?: string }): Promise<R2Objects>;
}

interface R2Env {
    MEDIA_BUCKET?: R2BucketLike;
}

/**
 * Return the R2 MEDIA_BUCKET binding from the Cloudflare Workers environment.
 *
 * Mirrors getDb() in lib/db/client.ts — calls getCloudflareContext({ async: true })
 * and throws a clear error if the binding is absent (e.g. running outside Workers).
 */
export async function getMediaBucket(): Promise<R2BucketLike> {
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx.env as unknown as R2Env;

    if (!env.MEDIA_BUCKET) {
        throw new Error(
            '[lib/storage/r2] R2 binding "MEDIA_BUCKET" is not available. ' +
                'Ensure the wrangler.jsonc r2_buckets binding is configured ' +
                'and you are running inside a Cloudflare Workers context.',
        );
    }

    return env.MEDIA_BUCKET;
}
