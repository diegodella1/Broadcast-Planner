import { NextResponse } from 'next/server';

import { getSlides } from '@/lib/data';
import { getWeatherSlideData } from '@/lib/slides/data/weather';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const slideId = new URL(request.url).searchParams.get('slideId');
        const slide = slideId
            ? (await getSlides()).find((candidate) => candidate.id === slideId)
            : null;
        const data = await getWeatherSlideData({ slide });

        return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[/api/slide-data/weather]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
