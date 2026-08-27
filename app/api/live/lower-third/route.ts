import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/auth';
import { getLiveSchedule } from '@/lib/data';
import { secondsSinceMidnightInTimezone } from '@/lib/helpers/time';
import { getLiveObjectConfig } from '@/lib/live-object';
import { updateLiveObjectLowerThird } from '@/lib/mutations';
import { findActiveSchedule } from '@/lib/scheduling/scheduler';
import { formatZodError, updateLiveLowerThirdSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        await requireAdmin();

        const parsed = updateLiveLowerThirdSchema.safeParse(await request.json().catch(() => ({})));

        if (!parsed.success) {
            return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
        }
        const body = parsed.data;
        const blockId = await activeLiveBlockId();

        if (!blockId) {
            return NextResponse.json({ error: 'No active live on air' }, { status: 400 });
        }
        const result = await updateLiveObjectLowerThird({
            blockId,
            visible: body.visible,
            text: body.text,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unauthorized';

        return NextResponse.json({ error: message }, { status: 401 });
    }
}

async function activeLiveBlockId() {
    const now = new Date();
    const schedule = await getLiveSchedule(now);
    const active = findActiveSchedule(schedule, secondsSinceMidnightInTimezone(now));
    const live = getLiveObjectConfig(active.block);

    return live ? active.block?.id : null;
}
