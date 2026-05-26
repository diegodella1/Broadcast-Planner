import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth';
import { getLiveSchedule } from '@/lib/data';
import { isOutputRequestAllowed, outputAccessDeniedReason } from '@/lib/output-auth';
import { findActiveSchedule } from '@/lib/scheduler';
import { secondsSinceMidnightInTimezone } from '@/lib/time';
import type { ProgramStatus, BlockCategory } from '@/lib/types';

export const dynamic = 'force-dynamic';

type ActiveBlockPayload = {
    blockId: string;
    blockTitle: string;
    blockCategory: BlockCategory;
    startsAt: number;
    durationSeconds: number;
    elapsedInBlock: number;
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
                      elapsedInBlock: Math.max(
                          0,
                          Math.min(active.elapsedInBlock, active.block.durationSeconds),
                      ),
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

async function isActiveBlockRequestAllowed(request: Request) {
    try {
        await requireAdmin();

        return true;
    } catch {
        const url = new URL(request.url);

        return isOutputRequestAllowed({ token: url.searchParams.get('token') ?? undefined });
    }
}
