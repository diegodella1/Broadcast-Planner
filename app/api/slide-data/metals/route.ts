import { NextResponse } from 'next/server';

import { withKvCache } from '@/lib/helpers/kv-cache';
import { getMarketsSatsData } from '@/lib/slides/data/markets';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'slide-data:metals';
const CACHE_TTL_SECONDS = 30;

/**
 * Metals slide-data endpoint.
 *
 * The metals (gold, silver, oil, copper) figures live inside the unified
 * markets payload produced by `getMarketsSatsData()`. We keep a separate KV
 * entry with a longer TTL than the markets route because the metals slide
 * tolerates slightly more staleness than the live markets ticker.
 */
export async function GET() {
    try {
        const data = await withKvCache(CACHE_KEY, CACHE_TTL_SECONDS, async () =>
            getMarketsSatsData(),
        );

        return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[/api/slide-data/metals]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
