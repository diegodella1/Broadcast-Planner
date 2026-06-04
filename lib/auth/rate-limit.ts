import { sql } from 'drizzle-orm';

import { getCurrentOperatorSession, hashSecret } from './auth';
import { apiRateLimits } from '../db/schema';
import { getDb } from '../db/client';

export type RateLimitResult = {
    allowed: boolean;
    retryAfterSeconds: number;
};

export async function assertRateLimit(input: {
    scope: string;
    request?: Request;
    limit?: number;
    windowSeconds?: number;
}) {
    const result = await checkRateLimit(input);

    if (!result.allowed) {
        const error = new Error('Rate limit exceeded');
        (error as Error & { retryAfterSeconds?: number }).retryAfterSeconds =
            result.retryAfterSeconds;
        throw error;
    }
}

export async function checkRateLimit(input: {
    scope: string;
    request?: Request;
    limit?: number;
    windowSeconds?: number;
}): Promise<RateLimitResult> {
    const limit = input.limit ?? 60;
    const windowSeconds = input.windowSeconds ?? 60;
    const identity = await rateLimitIdentity(input.request);
    const now = new Date();
    const bucketKey = `${input.scope}:${identity}:${Math.floor(now.getTime() / (windowSeconds * 1000))}`;
    const resetAt = new Date(
        Math.ceil(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000,
    );

    return atomicRateLimitHit(bucketKey, resetAt, now, limit);
}

/**
 * Atomic upsert that replicates the `increment_rate_limit` Postgres function.
 *
 * Semantics (from 20260522153000_atomic_rate_limits.sql):
 *   - INSERT a new row with hits=1 and the provided reset_at.
 *   - On conflict with an existing bucket_key:
 *       • If the stored reset_at <= now → the window expired; reset hits to 1
 *         and adopt the new reset_at.
 *       • Otherwise → still within the same window; increment hits by 1 and
 *         keep the original reset_at.
 *   - RETURNING hits and reset_at so the caller can evaluate the limit.
 *
 * SQLite serialises writes, so a single statement is atomic — no BEGIN needed.
 */
async function atomicRateLimitHit(
    bucketKey: string,
    resetAt: Date,
    now: Date,
    limit: number,
): Promise<RateLimitResult> {
    const resetAtIso = resetAt.toISOString();
    const nowIso = now.toISOString();

    try {
        const db = await getDb();
        const rows = await db
            .insert(apiRateLimits)
            .values({
                bucketKey,
                hits: 1,
                resetAt: resetAtIso,
                updatedAt: nowIso,
            })
            .onConflictDoUpdate({
                target: apiRateLimits.bucketKey,
                set: {
                    hits: sql<number>`case when ${apiRateLimits.resetAt} <= ${nowIso} then 1 else ${apiRateLimits.hits} + 1 end`,
                    resetAt: sql<string>`case when ${apiRateLimits.resetAt} <= ${nowIso} then ${resetAtIso} else ${apiRateLimits.resetAt} end`,
                    updatedAt: nowIso,
                },
            })
            .returning({
                hits: apiRateLimits.hits,
                resetAt: apiRateLimits.resetAt,
            });

        const row = rows[0];
        const effectiveResetAt = row ? new Date(row.resetAt) : resetAt;
        const hits = row ? row.hits : 1;

        return {
            allowed: hits <= limit,
            retryAfterSeconds: Math.max(
                1,
                Math.ceil((effectiveResetAt.getTime() - now.getTime()) / 1000),
            ),
        };
    } catch (error: unknown) {
        return fallbackForRateLimitBackendError(error);
    }
}

function fallbackForRateLimitBackendError(error: unknown): RateLimitResult {
    if (process.env.NODE_ENV === 'production') {
        throw error;
    }

    return { allowed: true, retryAfterSeconds: 0 };
}

export function rateLimitErrorResponse(error: unknown) {
    const retryAfterSeconds =
        typeof error === 'object' && error !== null && 'retryAfterSeconds' in error
            ? Number((error as { retryAfterSeconds?: unknown }).retryAfterSeconds)
            : 60;

    return { retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 60 };
}

async function rateLimitIdentity(request?: Request) {
    const session = await getCurrentOperatorSession();

    if (session) {
        return `operator:${session.operatorId}`;
    }
    const rawIp =
        request?.headers.get('cf-connecting-ip') ??
        request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request?.headers.get('x-real-ip') ??
        'unknown';

    return `ip:${hashSecret(rawIp)}`;
}
