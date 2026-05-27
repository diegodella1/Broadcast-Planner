import { NextResponse } from 'next/server';

import { withKvCache } from '@/lib/helpers/kv-cache';
import { getMarketsSatsData } from '@/lib/slides/data/markets';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'slide-data:markets';
const CACHE_TTL_SECONDS = 10;

export async function GET() {
    try {
        const data = await withKvCache(CACHE_KEY, CACHE_TTL_SECONDS, async () =>
            getMarketsSatsData(),
        );

        return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[/api/slide-data/markets]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
