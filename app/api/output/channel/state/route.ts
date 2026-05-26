import { NextResponse } from 'next/server';

import { composeChannelState, fallbackState } from '@/lib/output/channel-state';
import { isOutputRequestAllowed, outputAccessDeniedReason } from '@/lib/auth/output-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const allowed = await isOutputRequestAllowed({
            token: searchParams.get('token') ?? undefined,
        });

        if (!allowed) {
            return NextResponse.json({ error: outputAccessDeniedReason() }, { status: 401 });
        }
        const mediaAccessToken =
            searchParams.get('token') ?? process.env.OUTPUT_CAPTURE_TOKEN ?? '';
        const startAtParam = searchParams.get('startAt');
        const requestedStartAt = startAtParam === null ? null : Number(startAtParam);
        const state = await composeChannelState({
            now: new Date(),
            previewBlockId: searchParams.get('previewBlockId'),
            requestedStartAt,
            mediaAccessToken,
        });

        return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        return NextResponse.json(
            { ...fallbackState('state-error'), error: message },
            { status: 200 },
        );
    }
}
