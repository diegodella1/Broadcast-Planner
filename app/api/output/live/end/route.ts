import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/auth';
import { isOutputRequestAllowed, outputAccessDeniedReason } from '@/lib/auth/output-auth';
import { markLiveObjectEnded } from '@/lib/mutations';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') ?? undefined;
    const allowed = await isLiveEndRequestAllowed(token ? { token } : {});

    if (!allowed) {
        return NextResponse.json({ error: outputAccessDeniedReason() }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
        blockId?: string;
        reason?: string;
    };

    if (!body.blockId) {
        return NextResponse.json({ error: 'blockId is required' }, { status: 400 });
    }
    const result = await markLiveObjectEnded({
        blockId: body.blockId,
        reason: body.reason || 'manual',
        failed: body.reason === 'dead-timeout' || body.reason === 'failed',
    });

    if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
}

async function isLiveEndRequestAllowed(input: { token?: string }) {
    try {
        await requireAdmin();

        return true;
    } catch {
        return isOutputRequestAllowed(input);
    }
}
