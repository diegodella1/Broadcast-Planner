import { NextResponse } from 'next/server';

import { getSataSlideData, getStrcSlideData } from '@/lib/slides/data/strc';

export const dynamic = 'force-dynamic';

/**
 * STRC + SATA slide-data endpoint.
 *
 * The strc lib helper exposes two fetchers (one per slide template) so we
 * surface both shapes in a single response. Consumers pick the section they
 * need based on the slide template id (`strc` vs `sata`).
 */
export async function GET() {
    try {
        const [strc, sata] = await Promise.all([getStrcSlideData(), getSataSlideData()]);

        return NextResponse.json({ strc, sata }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[/api/slide-data/strc]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
