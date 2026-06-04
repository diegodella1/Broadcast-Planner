import { and, asc, eq, or, sql } from 'drizzle-orm';

import { withKvCache } from '@/lib/helpers/kv-cache';
import {
    isoDateInTimezone,
    PLAYOUT_TIMEZONE,
    secondsSinceMidnightInTimezone,
} from '@/lib/helpers/time';
import { collectOperatorHealth } from '@/lib/health/health-checks';
import { getDb } from '@/lib/db/client';
import { integrationSettings, mediaAssets, programBlocks, programDays } from '@/lib/db/schema';

const STATUS_CACHE_KEY = 'broadcast-status:v1';
const STATUS_TTL_SECONDS = 10;
const HEALTH_CACHE_KEY = 'broadcast-status:health:v1';
const HEALTH_TTL_SECONDS = 60;

type HealthStatus = 'ok' | 'degraded' | 'fail';

export type BroadcastStatus =
    | {
          ok: true;
          health: HealthStatus;
          dayStatus: string;
          nowSeconds: number;
          activeTitle: string | null;
          nextTitle: string | null;
          nextSeconds: number | null;
          fallbackTitle: string | null;
      }
    | {
          ok: false;
          health: 'fail';
          dayStatus: 'draft';
          nowSeconds: null;
          activeTitle: null;
          nextTitle: null;
          nextSeconds: null;
          fallbackTitle: null;
      };

export async function getBroadcastStatus(): Promise<BroadcastStatus> {
    return withKvCache(STATUS_CACHE_KEY, STATUS_TTL_SECONDS, computeBroadcastStatus);
}

async function computeBroadcastStatus(): Promise<BroadcastStatus> {
    try {
        const db = await getDb();
        const today = isoDateInTimezone(new Date(), PLAYOUT_TIMEZONE);

        const [dayRow, fallbackRow, carouselRow, healthStatus] = await Promise.all([
            db
                .select({
                    id: programDays.id,
                    status: programDays.status,
                    timezone: programDays.timezone,
                })
                .from(programDays)
                .where(eq(programDays.airDate, today))
                .limit(1)
                .then((rows) => rows[0] ?? null),

            db
                .select({ id: mediaAssets.id, title: mediaAssets.title })
                .from(mediaAssets)
                .where(
                    and(
                        eq(mediaAssets.status, 'ready'),
                        eq(mediaAssets.mediaKind, 'video'),
                        or(
                            eq(mediaAssets.assetType, 'fallback'),
                            sql`json_extract(${mediaAssets.metadata}, '$.fallback_loop') = true`,
                        ),
                    ),
                )
                .limit(1)
                .then((rows) => rows[0] ?? null),

            db
                .select({ publicConfig: integrationSettings.publicConfig })
                .from(integrationSettings)
                .where(eq(integrationSettings.provider, 'fallback_carousel'))
                .limit(1)
                .then((rows) => rows[0] ?? null),

            getHealthStatus(),
        ]);

        const timezone = dayRow?.timezone ?? PLAYOUT_TIMEZONE;
        const nowSeconds = secondsSinceMidnightInTimezone(new Date(), timezone);
        const dayStatus = dayRow?.status ?? 'draft';
        let activeTitle: string | null = null;
        let nextTitle: string | null = null;
        let nextSeconds: number | null = null;

        if (dayRow?.id) {
            const blocks = await db
                .select({
                    title: programBlocks.title,
                    startTimeSeconds: programBlocks.startTimeSeconds,
                    durationSeconds: programBlocks.durationSeconds,
                })
                .from(programBlocks)
                .where(
                    and(
                        eq(programBlocks.programDayId, dayRow.id),
                        or(eq(programBlocks.status, 'ready'), eq(programBlocks.status, 'active')),
                    ),
                )
                .orderBy(asc(programBlocks.startTimeSeconds))
                .limit(1000);

            for (const block of blocks) {
                const start = block.startTimeSeconds;
                const duration = block.durationSeconds;

                if (nowSeconds >= start && nowSeconds < start + duration) {
                    activeTitle = block.title;
                }

                if (start > nowSeconds && nextSeconds === null) {
                    nextTitle = block.title;
                    nextSeconds = start;
                }
            }
        }

        const carousel =
            typeof carouselRow?.publicConfig === 'object' && carouselRow.publicConfig !== null
                ? (carouselRow.publicConfig as Record<string, unknown>)
                : undefined;
        const carouselEnabled = carousel?.enabled === true;
        const fallbackTitle = fallbackRow?.title ?? (carouselEnabled ? 'Slide carousel' : null);

        return {
            ok: true,
            health: healthStatus,
            dayStatus,
            nowSeconds,
            activeTitle,
            nextTitle,
            nextSeconds,
            fallbackTitle,
        };
    } catch {
        return {
            ok: false,
            health: 'fail',
            dayStatus: 'draft',
            nowSeconds: null,
            activeTitle: null,
            nextTitle: null,
            nextSeconds: null,
            fallbackTitle: null,
        };
    }
}

async function getHealthStatus(): Promise<HealthStatus> {
    return withKvCache(HEALTH_CACHE_KEY, HEALTH_TTL_SECONDS, async () => {
        try {
            const report = await collectOperatorHealth();

            return report.status;
        } catch {
            return 'fail';
        }
    });
}
