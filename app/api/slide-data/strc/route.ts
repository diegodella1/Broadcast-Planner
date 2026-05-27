import { NextResponse } from 'next/server';

import { withKvCache } from '@/lib/helpers/kv-cache';
import { getSataSlideData, getStrcSlideData } from '@/lib/slides/data/strc';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'slide-data:strc';
const CACHE_TTL_SECONDS = 60;

/**
 * STRC + SATA slide-data endpoint.
 *
 * The strc lib helper exposes two fetchers (one per slide template) so we
 * surface both shapes in a single response. Consumers pick the section they
 * need based on the slide template id (`strc` vs `sata`).
 */
export async function GET() {
    try {
        const payload = await withKvCache(CACHE_KEY, CACHE_TTL_SECONDS, async () => {
            const [strc, sata] = await Promise.all([getStrcSlideData(), getSataSlideData()]);

            return { strc, sata };
        });

        return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[/api/slide-data/strc]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
