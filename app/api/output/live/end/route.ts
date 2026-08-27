import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/auth';
import { isOutputRequestAllowed, outputAccessDeniedReason } from '@/lib/auth/output-auth';
import { markLiveObjectEnded } from '@/lib/mutations';
import { endLiveSchema, formatZodError } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') ?? undefined;
    const allowed = await isLiveEndRequestAllowed(token ? { token } : {});

    if (!allowed) {
        return NextResponse.json({ error: outputAccessDeniedReason() }, { status: 401 });
    }

    const parsed = endLiveSchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
        return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const body = parsed.data;
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
