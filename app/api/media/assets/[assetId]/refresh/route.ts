import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/auth';
import { verifyCsrfToken } from '@/lib/auth/csrf';
import { assertRateLimit, rateLimitErrorResponse } from '@/lib/auth/rate-limit';
import { refreshPublicAsset } from '@/lib/media/asset-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
    try {
        await requireAdmin();
        await assertRateLimit({
            scope: 'api:assets:refresh',
            request,
            limit: 30,
            windowSeconds: 60,
        });
        await verifyCsrfToken(request);
        const { assetId } = await params;
        const result = await refreshPublicAsset(assetId);

        return NextResponse.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status =
            message === 'Unauthorized'
                ? 401
                : message === 'Invalid CSRF token'
                  ? 403
                  : message === 'Asset not found'
                    ? 404
                    : message === 'Rate limit exceeded'
                      ? 429
                      : 400;
        const headers =
            status === 429
                ? { 'Retry-After': String(rateLimitErrorResponse(error).retryAfterSeconds) }
                : undefined;

        return NextResponse.json({ error: message }, { status, ...(headers ? { headers } : {}) });
    }
}
