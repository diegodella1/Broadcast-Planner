import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth';
import { verifyCsrfToken } from '@/lib/csrf';
import { getMusicPreference, saveMusicPreference } from '@/lib/operator-preferences';
import { assertRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { updateMusicPreferenceSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await requireAdmin();

        return NextResponse.json(await getMusicPreference(), {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        await requireAdmin();
        await assertRateLimit({
            scope: 'api:operator:music',
            request,
            limit: 30,
            windowSeconds: 60,
        });
        await verifyCsrfToken(request);
        const rawBody = (await request.json()) as unknown;
        const parsed = updateMusicPreferenceSchema.safeParse(rawBody);

        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.flatten().formErrors.join(', ') || 'Invalid input' },
                { status: 400 },
            );
        }

        return NextResponse.json(
            await saveMusicPreference(parsed.data as Record<string, unknown>),
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (error instanceof Error && error.message === 'Rate limit exceeded') {
            const { retryAfterSeconds } = rateLimitErrorResponse(error);

            return NextResponse.json(
                { error: 'Rate limit exceeded' },
                { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
            );
        }

        if (error instanceof Error && error.message === 'Invalid CSRF token') {
            return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
        }

        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
