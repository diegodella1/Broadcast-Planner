import { NextResponse } from 'next/server';

import { getSaudiMarketOpenData } from '@/lib/slides/data/saudi-market-open';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        return NextResponse.json(await getSaudiMarketOpenData(), {
            headers: { 'Cache-Control': 'private, max-age=0, no-store' },
        });
    } catch (error) {
        console.error('[/api/slide-data/saudi-market-open]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
