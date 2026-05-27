import { NextResponse } from 'next/server';

import { getSlides } from '@/lib/data';
import { withKvCache } from '@/lib/helpers/kv-cache';
import { getWeatherSlideData } from '@/lib/slides/data/weather';

export const dynamic = 'force-dynamic';

const CACHE_TTL_SECONDS = 600;

export async function GET(request: Request) {
    try {
        const slideId = new URL(request.url).searchParams.get('slideId');
        const cacheKey = `slide-data:weather:${slideId ?? 'default'}`;

        const data = await withKvCache(cacheKey, CACHE_TTL_SECONDS, async () => {
            const slide = slideId
                ? ((await getSlides()).find((candidate) => candidate.id === slideId) ?? null)
                : null;

            return getWeatherSlideData({ slide });
        });

        return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[/api/slide-data/weather]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
