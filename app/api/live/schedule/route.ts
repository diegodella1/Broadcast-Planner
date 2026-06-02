import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/auth';
import {
    formatTimecode,
    isoDateInTimezone,
    PLAYOUT_TIMEZONE,
    secondsSinceMidnightInTimezone,
} from '@/lib/helpers/time';
import { scheduleLiveObjectOverride } from '@/lib/mutations';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        await requireAdmin();

        const body = (await request.json().catch(() => ({}))) as {
            date?: string;
            title?: string;
            startTime?: string;
            liveSourceType?: string;
            liveUrl?: string;
            timingMode?: string;
        };
        const now = new Date();
        const sendNow = body.timingMode === 'now';
        const date = sendNow ? isoDateInTimezone(now, PLAYOUT_TIMEZONE) : body.date?.trim();
        const startTime = sendNow
            ? formatTimecode(secondsSinceMidnightInTimezone(now))
            : normalizeStartTime(body.startTime || '');
        const liveUrl = body.liveUrl?.trim();

        if (!date) {
            return NextResponse.json({ error: 'date is required' }, { status: 400 });
        }

        if (!startTime) {
            return NextResponse.json({ error: 'startTime is required' }, { status: 400 });
        }

        if (!liveUrl) {
            return NextResponse.json({ error: 'liveUrl is required' }, { status: 400 });
        }
        const result = await scheduleLiveObjectOverride({
            date,
            title: body.title || 'Live',
            startTime,
            liveSourceType: body.liveSourceType || 'youtube',
            liveUrl,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json({ ok: true, blockId: result.data.id });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unauthorized';

        return NextResponse.json({ error: message }, { status: 401 });
    }
}

function normalizeStartTime(value: string) {
    const trimmed = value.trim();

    if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
        return `${trimmed}:00`;
    }

    return trimmed;
}
