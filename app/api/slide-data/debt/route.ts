import { NextResponse } from 'next/server';

import { getDebtSlideData } from '@/lib/slides/data/debt';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const data = await getDebtSlideData();

        return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[/api/slide-data/debt]', error);

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'fetch failed' },
            { status: 500 },
        );
    }
}
