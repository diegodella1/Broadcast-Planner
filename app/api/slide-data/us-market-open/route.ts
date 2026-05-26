import { NextResponse } from 'next/server';

import { getUsMarketOpenData } from '@/lib/slides/data/us-market-open';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await getUsMarketOpenData();

        return NextResponse.json(data, {
            headers: { 'Cache-Control': 'private, max-age=0, no-store' },
        });
    } catch (error) {
        console.error('[/api/slide-data/us-market-open]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
