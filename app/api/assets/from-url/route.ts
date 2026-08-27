import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/auth';
import { verifyCsrfToken } from '@/lib/auth/csrf';
import { assertRateLimit, rateLimitErrorResponse } from '@/lib/auth/rate-limit';
import { createOrRefreshPublicAsset } from '@/lib/media/asset-metadata';
import { createPublicAssetSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
    try {
        await requireAdmin();
        await assertRateLimit({
            scope: 'api:assets:from-url',
            request,
            limit: 20,
            windowSeconds: 60,
        });
        await verifyCsrfToken(request);
        const parsed = createPublicAssetSchema.safeParse(await request.json());

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid public URL' }, { status: 400 });
        }
        const result = await createOrRefreshPublicAsset(parsed.data.url);

        return NextResponse.json(result, { status: result.created ? 201 : 200 });
    } catch (error) {
        return routeError(error);
    }
}

function routeError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (message === 'Unauthorized') {
        return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message === 'Invalid CSRF token') {
        return NextResponse.json({ error: message }, { status: 403 });
    }

    if (message === 'Rate limit exceeded') {
        const { retryAfterSeconds } = rateLimitErrorResponse(error);

        return NextResponse.json(
            { error: message },
            { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
        );
    }

    return NextResponse.json({ error: message }, { status: 400 });
}
