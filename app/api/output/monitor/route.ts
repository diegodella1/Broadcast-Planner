import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth/auth';
import { getLiveSchedule } from '@/lib/data';
import { getActiveOutputOverride } from '@/lib/output-overrides';
import { findActiveSchedule } from '@/lib/scheduling/scheduler';
import { secondsSinceMidnightInTimezone, PLAYOUT_TIMEZONE } from '@/lib/helpers/time';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await requireAdmin();
        const now = new Date();
        const bundle = await getLiveSchedule(now);
        const timezone = bundle.day?.timezone ?? PLAYOUT_TIMEZONE;
        const serverSeconds = secondsSinceMidnightInTimezone(now, timezone);
        const active = findActiveSchedule(bundle, serverSeconds);
        const override = await getActiveOutputOverride(bundle.day?.id);
        const asset = active.asset ?? null;

        return NextResponse.json(
            {
                generatedAt: now.toISOString(),
                timezone,
                serverSeconds,
                day: bundle.day
                    ? { id: bundle.day.id, airDate: bundle.day.airDate, status: bundle.day.status }
                    : null,
                block: active.block
                    ? {
                          id: active.block.id,
                          title: active.block.title,
                          status: active.block.status,
                          startTimeSeconds: active.block.startTimeSeconds,
                          durationSeconds: active.block.durationSeconds,
                          elapsedInBlock: active.elapsedInBlock,
                      }
                    : null,
                asset: asset
                    ? {
                          id: asset.id,
                          title: asset.title,
                          sourceType: asset.sourceType,
                          status: asset.status,
                          lifecycleState: asset.lifecycleState ?? 'reviewed',
                          playbackReadinessStatus: asset.playbackReadinessStatus ?? 'unchecked',
                          playbackError: asset.playbackError ?? null,
                      }
                    : null,
                fallback: active.fallbackAsset
                    ? { id: active.fallbackAsset.id, title: active.fallbackAsset.title }
                    : null,
                fallbackReason: active.reason ?? null,
                override: override
                    ? {
                          id: override.id,
                          sourceType: override.sourceType,
                          label: override.label,
                          streamProtocol: override.streamProtocol,
                          expiresAt: override.expiresAt,
                      }
                    : null,
                mediaError:
                    asset?.playbackReadinessStatus === 'failed' ||
                    asset?.playbackReadinessStatus === 'review'
                        ? (asset.playbackError ?? 'Media playback needs review')
                        : null,
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
