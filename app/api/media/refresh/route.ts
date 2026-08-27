import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/auth';
import { verifyCsrfToken } from '@/lib/auth/csrf';
import { assertRateLimit } from '@/lib/auth/rate-limit';
import { refreshPublicAssetBatch } from '@/lib/media/asset-metadata';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        await requireAdmin();
        await assertRateLimit({
            scope: 'api:media:refresh',
            request,
            limit: 10,
            windowSeconds: 60,
        });
        await verifyCsrfToken(request);

        return NextResponse.json(await refreshPublicAssetBatch(25, 3));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status =
            message === 'Unauthorized'
                ? 401
                : message === 'Invalid CSRF token'
                  ? 403
                  : message === 'Rate limit exceeded'
                    ? 429
                    : 500;

        return NextResponse.json({ error: message }, { status });
    }
}
