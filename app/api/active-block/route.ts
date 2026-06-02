import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/auth';
import { getLiveSchedule } from '@/lib/data';
import { isOutputRequestAllowed, outputAccessDeniedReason } from '@/lib/auth/output-auth';
import { findActiveSchedule } from '@/lib/scheduling/scheduler';
import { secondsSinceMidnightInTimezone } from '@/lib/helpers/time';
import { getLiveObjectConfig } from '@/lib/live-object';
import type { ProgramStatus, BlockCategory } from '@/lib/types';

export const dynamic = 'force-dynamic';

type ActiveBlockPayload = {
    blockId: string;
    blockTitle: string;
    blockCategory: BlockCategory;
    startsAt: number;
    durationSeconds: number;
    elapsedInBlock: number;
    live?: {
        sourceType: string;
        status: string;
        url: string;
    };
};

type ActiveBlockResponse = {
    active: ActiveBlockPayload | null;
    dayStatus: ProgramStatus;
};

export async function GET(request: Request) {
    try {
        if (!(await isActiveBlockRequestAllowed(request))) {
            return NextResponse.json({ error: outputAccessDeniedReason() }, { status: 401 });
        }

        const now = new Date();
        const bundle = await getLiveSchedule(now);
        const active = findActiveSchedule(bundle, secondsSinceMidnightInTimezone(now));

        const dayStatus: ProgramStatus = bundle.day?.status ?? 'draft';

        const payload: ActiveBlockResponse = active.block
            ? {
                  active: {
                      blockId: active.block.id,
                      blockTitle: active.block.title,
                      blockCategory: active.block.category,
                      startsAt: active.block.startTimeSeconds,
                      durationSeconds: active.block.durationSeconds,
                      elapsedInBlock: Math.max(0, active.elapsedInBlock),
                      ...(livePayload(active.block) ? { live: livePayload(active.block)! } : {}),
                  },
                  dayStatus,
              }
            : { active: null, dayStatus };

        return NextResponse.json(payload, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        console.error('[api/active-block] failed to resolve active block', error);
        const message = error instanceof Error ? error.message : 'Unknown error';

        return NextResponse.json({ error: message }, { status: 500 });
    }
}

function livePayload(block: NonNullable<ReturnType<typeof findActiveSchedule>['block']>) {
    const live = getLiveObjectConfig(block);

    if (!live) {
        return null;
    }

    return {
        sourceType: live.sourceType,
        status: live.status,
        url: live.url,
    };
}

async function isActiveBlockRequestAllowed(request: Request) {
    try {
        await requireAdmin();

        return true;
    } catch {
        const url = new URL(request.url);

        return isOutputRequestAllowed({ token: url.searchParams.get('token') ?? undefined });
    }
}
