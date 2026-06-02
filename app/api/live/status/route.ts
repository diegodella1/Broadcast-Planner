import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/auth';
import { getLiveSchedule, getScheduleForDate } from '@/lib/data';
import {
    formatTimecode,
    isoDateInTimezone,
    parseTimecode,
    PLAYOUT_TIMEZONE,
    secondsSinceMidnightInTimezone,
} from '@/lib/helpers/time';
import { isLiveObjectEnded } from '@/lib/live-object';
import { findActiveSchedule } from '@/lib/scheduling/scheduler';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        await requireAdmin();

        const now = new Date();
        const currentAirDate = isoDateInTimezone(now, PLAYOUT_TIMEZONE);
        const currentSeconds = secondsSinceMidnightInTimezone(now);
        const url = new URL(request.url);
        const date = url.searchParams.get('date') || currentAirDate;
        const startTime =
            normalizeStartTime(url.searchParams.get('startTime') || '') ||
            formatTimecode(currentSeconds);
        const liveBundle = await getLiveSchedule(now);
        const active = findActiveSchedule(liveBundle, currentSeconds);
        const preview = await buildPreview(date, startTime);

        return NextResponse.json(
            {
                currentAirDate,
                currentTime: formatTimecode(currentSeconds),
                timezone: PLAYOUT_TIMEZONE,
                active: active.block
                    ? {
                          blockId: active.block.id,
                          title: active.block.title,
                          startTime: active.block.startTime,
                          live: active.block.metadata?.live_object === true,
                      }
                    : null,
                preview,
            },
            { headers: { 'Cache-Control': 'no-store' } },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unauthorized';

        return NextResponse.json({ error: message }, { status: 401 });
    }
}

async function buildPreview(date: string, startTime: string) {
    const startTimeSeconds = parseTimecode(startTime);
    const schedule = await getScheduleForDate(date);
    const affected = schedule.blocks
        .filter((block) => block.status !== 'archived')
        .filter((block) => !isLiveObjectEnded(block))
        .filter((block) => block.startTimeSeconds + block.durationSeconds > startTimeSeconds)
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
        .slice(0, 8)
        .map((block) => ({
            id: block.id,
            title: block.title,
            startTime: block.startTime,
            endTime: formatTimecode(block.startTimeSeconds + block.durationSeconds),
            live: block.metadata?.live_object === true,
        }));

    return {
        date,
        startTime,
        willOverride: affected.length > 0,
        affected,
    };
}

function normalizeStartTime(value: string) {
    const trimmed = value.trim();

    if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
        return `${trimmed}:00`;
    }

    return trimmed;
}
