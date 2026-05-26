import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth';
import { searchVimeoCatalog } from '@/lib/manual-broadcast';
import { vimeoSearchSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        await requireAdmin();
        const { searchParams } = new URL(request.url);
        const parsed = vimeoSearchSchema.safeParse({ query: searchParams.get('q') ?? '' });

        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid query' },
                { status: 400 },
            );
        }
        const results = await searchVimeoCatalog(parsed.data.query);

        return NextResponse.json(results, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[api/vimeo/search]', error);

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
