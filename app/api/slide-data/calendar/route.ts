import { NextResponse } from 'next/server';

import { withKvCache } from '@/lib/helpers/kv-cache';
import { getUpcomingCalendarEvents } from '@/lib/slides/data/calendar';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'slide-data:calendar';
const CACHE_TTL_SECONDS = 60;

export async function GET() {
    try {
        const events = await withKvCache(CACHE_KEY, CACHE_TTL_SECONDS, async () =>
            getUpcomingCalendarEvents(),
        );

        return NextResponse.json({ events }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[/api/slide-data/calendar]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
