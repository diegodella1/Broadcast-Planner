import { NextResponse } from 'next/server';

import { writeSmokeStatus } from '@/lib/health/smoke-status';
import { smokeStatusSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const expected = process.env.SMOKE_WRITE_TOKEN;

    if (!expected) {
        return NextResponse.json({ error: 'SMOKE_WRITE_TOKEN not configured' }, { status: 503 });
    }
    const provided = request.headers.get('x-smoke-token');

    if (provided !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const rawBody = (await request.json()) as unknown;
        const parsed = smokeStatusSchema.safeParse(rawBody);

        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.flatten().formErrors.join(', ') || 'Invalid input' },
                { status: 400 },
            );
        }
        const recordedAt = parsed.data.recordedAt ?? new Date().toISOString();
        const payload = {
            status: parsed.data.status,
            ...(parsed.data.label ? { label: parsed.data.label } : {}),
            recordedAt,
        };
        await writeSmokeStatus(payload);

        return NextResponse.json(
            { ok: true, recordedAt },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        console.error('[/api/internal/smoke-status]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'write failed' },
            { status: 500 },
        );
    }
}
