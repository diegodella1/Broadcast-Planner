import { NextResponse } from 'next/server';

import { getMarketsSatsData } from '@/lib/slides/data/markets';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await getMarketsSatsData();

        return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[/api/slide-data/markets]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
