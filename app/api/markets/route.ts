import { NextResponse } from 'next/server';

import { getMarketData } from '@/lib/services/market-data';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        return NextResponse.json(
            { markets: await getMarketData() },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
