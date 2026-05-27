import { NextResponse } from 'next/server';

import { withKvCache } from '@/lib/helpers/kv-cache';
import { getDebtSlideData } from '@/lib/slides/data/debt';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'slide-data:debt';
const CACHE_TTL_SECONDS = 300;

export async function GET() {
    try {
        const data = await withKvCache(CACHE_KEY, CACHE_TTL_SECONDS, async () =>
            getDebtSlideData(),
        );

        return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[/api/slide-data/debt]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
