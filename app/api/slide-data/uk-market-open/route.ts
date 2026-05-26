import { NextResponse } from 'next/server';

import { getUkMarketOpenData } from '@/lib/slides/data/uk-market-open';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        return NextResponse.json(await getUkMarketOpenData(), {
            headers: { 'Cache-Control': 'private, max-age=0, no-store' },
        });
    } catch (error) {
        console.error('[/api/slide-data/uk-market-open]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
