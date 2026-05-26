import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth';
import { getScheduleForDate } from '@/lib/data';
import { analyzeSchedule, withScheduleIssueLinks } from '@/lib/schedule-health';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
    try {
        await requireAdmin();
        const { date } = await params;
        const schedule = await getScheduleForDate(date);
        const blocks = [...schedule.blocks].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
        const health = analyzeSchedule(schedule, blocks);

        return NextResponse.json(
            {
                generatedAt: new Date().toISOString(),
                criticalCount: health.criticalCount,
                warnCount: health.warnCount,
                issues: health.issues.map((issue) => withScheduleIssueLinks(date, issue)),
            },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const message = error instanceof Error ? error.message : 'Unknown error';

        return NextResponse.json({ error: message }, { status: 500 });
    }
}
