import { NextResponse } from 'next/server';

import { getLivePlaybackSchedule } from '@/lib/data';
import { isOutputRequestAllowed, outputAccessDeniedReason } from '@/lib/auth/output-auth';
import { secondsSinceMidnightInTimezone } from '@/lib/helpers/time';

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

        return NextResponse.json(
            {
                schedule: await getLivePlaybackSchedule(),
                secondsOfDay: secondsSinceMidnightInTimezone(),
            },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
