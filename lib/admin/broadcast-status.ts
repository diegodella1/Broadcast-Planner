import { withKvCache } from '@/lib/helpers/kv-cache';
import {
    isoDateInTimezone,
    PLAYOUT_TIMEZONE,
    secondsSinceMidnightInTimezone,
} from '@/lib/helpers/time';
import { collectOperatorHealth } from '@/lib/health/health-checks';
import { createServiceClient } from '@/lib/supabase/server';

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
        const supabase = createServiceClient();
        const today = isoDateInTimezone(new Date(), PLAYOUT_TIMEZONE);
        const [dayResult, fallbackResult, carouselResult, healthStatus] = await Promise.all([
            supabase
                .from('program_days')
                .select('id,status,timezone')
                .eq('air_date', today)
                .maybeSingle(),
            supabase
                .from('media_assets')
                .select('id,title')
                .eq('status', 'ready')
                .eq('media_kind', 'video')
                .or('asset_type.eq.fallback,metadata->>fallback_loop.eq.true')
                .limit(1)
                .maybeSingle(),
            supabase
                .from('integration_settings')
                .select('public_config')
                .eq('provider', 'fallback_carousel')
                .maybeSingle(),
            getHealthStatus(),
        ]);
        const dayRow = dayResult.data;
        const timezone = (dayRow?.timezone as string | null) ?? PLAYOUT_TIMEZONE;
        const nowSeconds = secondsSinceMidnightInTimezone(new Date(), timezone);
        const dayStatus = (dayRow?.status as string | null) ?? 'draft';
        let activeTitle: string | null = null;
        let nextTitle: string | null = null;
        let nextSeconds: number | null = null;

        if (dayRow?.id) {
            const { data: blocks } = await supabase
                .from('program_blocks')
                .select('title,start_time_seconds,duration_seconds')
                .eq('program_day_id', dayRow.id as string)
                .in('status', ['ready', 'active'])
                .order('start_time_seconds')
                .range(0, 999);

            for (const block of blocks ?? []) {
                const start = Number(block.start_time_seconds);
                const duration = Number(block.duration_seconds);

                if (nowSeconds >= start && nowSeconds < start + duration) {
                    activeTitle = String(block.title);
                }

                if (start > nowSeconds && nextSeconds === null) {
                    nextTitle = String(block.title);
                    nextSeconds = start;
                }
            }
        }
        const carousel = carouselResult.data?.public_config as Record<string, unknown> | undefined;
        const carouselEnabled = carousel?.enabled === true;
        const fallbackTitle =
            (fallbackResult.data?.title as string | undefined) ??
            (carouselEnabled ? 'Slide carousel' : null);

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
