import { getLiveSchedule } from '../data';
import { getActiveOutputOverride } from '../output-overrides';
import { getReutersSettings } from '../services/reuters-credentials';
import { getVimeoSettings, getVimeoToken } from '../settings';
import {
    isSmokeStatusOk,
    isSmokeStatusStale,
    readSmokeStatus,
    smokeStatusMessage,
} from './smoke-status';
import { getDb } from '../db/client';
import { getMediaBucket } from '../storage/r2';
import {
    adminOperators,
    guests,
    mediaAssets,
    operatorPreferences,
    outputOverrides,
    programDays,
    slideAssets,
} from '../db/schema';

type VimeoSettings = Awaited<ReturnType<typeof getVimeoSettings>>;
type VimeoToken = Awaited<ReturnType<typeof getVimeoToken>>;
type ReutersSettings = Awaited<ReturnType<typeof getReutersSettings>>;
type LiveSchedule = Awaited<ReturnType<typeof getLiveSchedule>>;

type SettingsResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export type CollectOperatorHealthOptions = {
    preloadedLiveSchedule?: LiveSchedule;
};

async function safeSettings<T>(loader: () => Promise<T>): Promise<SettingsResult<T>> {
    try {
        return { ok: true, value: await loader() };
    } catch (error) {
        return { ok: false, error };
    }
}

export type OperatorHealthStatus = 'ok' | 'degraded' | 'fail';

export type OperatorHealthCheck = {
    id:
        | 'env'
        | 'supabase'
        | 'schema'
        | 'storage'
        | 'vimeo'
        | 'reuters'
        | 'output'
        | 'migrations'
        | 'smoke';
    label: string;
    ok: boolean;
    status: OperatorHealthStatus;
    message: string;
    href?: string;
};

export type OperatorHealthReport = {
    ok: boolean;
    status: OperatorHealthStatus;
    service: 'roxom-playout-manager';
    generatedAt: string;
    uptime: number;
    checks: Record<OperatorHealthCheck['id'], OperatorHealthCheck>;
};

export function sanitizeOperatorHealthReport(report: OperatorHealthReport): OperatorHealthReport {
    const checks = Object.fromEntries(
        Object.entries(report.checks).map(([id, check]) => [
            id,
            {
                id: check.id,
                label: check.label,
                ok: check.ok,
                status: check.status,
                message: publicHealthMessage(check.status),
            },
        ]),
    ) as OperatorHealthReport['checks'];

    return { ...report, checks };
}

export async function collectOperatorHealth(
    options: CollectOperatorHealthOptions = {},
): Promise<OperatorHealthReport> {
    const [vimeoSettings, vimeoToken, reutersSettings] = await Promise.all([
        safeSettings(getVimeoSettings),
        safeSettings(getVimeoToken),
        safeSettings(getReutersSettings),
    ]);
    const [supabase, schema, storage, vimeo, reuters, output, migrations, smoke] =
        await Promise.all([
            checkSupabase(),
            checkSchema(),
            checkStorage(),
            checkVimeo(vimeoSettings, vimeoToken),
            checkReuters(reutersSettings),
            checkOutput(options.preloadedLiveSchedule),
            checkMigrations(),
            checkSmoke(),
        ]);
    const checks = {
        env: checkEnv(),
        supabase,
        schema,
        storage,
        vimeo,
        reuters,
        output,
        migrations,
        smoke,
    } satisfies OperatorHealthReport['checks'];
    const ok = Object.values(checks).every((check) => check.ok);
    const degraded = ok && Object.values(checks).some((check) => check.status === 'degraded');

    return {
        ok,
        status: ok ? (degraded ? 'degraded' : 'ok') : 'fail',
        service: 'roxom-playout-manager',
        generatedAt: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        checks,
    };
}

function checkEnv(): OperatorHealthCheck {
    const missing = [
        'APP_ENCRYPTION_KEY',
        'ADMIN_BOOTSTRAP_TOKEN',
        ...(process.env.NODE_ENV === 'production' ? ['OUTPUT_CAPTURE_TOKEN'] : []),
    ].filter((key) => !process.env[key]);

    if (
        process.env.ALLOW_DEMO_DATA === 'true' &&
        (process.env.NODE_ENV === 'production' ||
            process.env.APP_BASE_URL?.startsWith('https://') ||
            process.env.NEXT_PUBLIC_APP_BASE_URL?.startsWith('https://'))
    ) {
        return fail('env', 'Environment', 'ALLOW_DEMO_DATA cannot be enabled in production');
    }

    return missing.length
        ? fail('env', 'Environment', `Missing required env: ${missing.join(', ')}`)
        : pass('env', 'Environment', 'Required environment is configured');
}

async function checkSupabase(): Promise<OperatorHealthCheck> {
    try {
        const db = await getDb();

        await db.select({ id: programDays.id }).from(programDays).limit(1);

        return pass('supabase', 'Database', 'D1 database query succeeded');
    } catch (error) {
        return fail('supabase', 'Database', `D1 database unavailable: ${errorMessage(error)}`);
    }
}

async function checkSchema(): Promise<OperatorHealthCheck> {
    try {
        const db = await getDb();

        await Promise.all([
            db
                .select({
                    id: mediaAssets.id,
                    playbackReadinessStatus: mediaAssets.playbackReadinessStatus,
                    playbackCheckedAt: mediaAssets.playbackCheckedAt,
                    playbackError: mediaAssets.playbackError,
                })
                .from(mediaAssets)
                .limit(1),
            db
                .select({
                    id: slideAssets.id,
                    templateId: slideAssets.templateId,
                    metadata: slideAssets.metadata,
                })
                .from(slideAssets)
                .limit(1),
            db
                .select({
                    id: guests.id,
                    photoAssetId: guests.photoAssetId,
                    videoAssetId: guests.videoAssetId,
                    updatedAt: guests.updatedAt,
                })
                .from(guests)
                .limit(1),
        ]);

        return pass('schema', 'Schema', 'Required D1 tables and columns present');
    } catch (error) {
        return degraded('schema', 'Schema', `Schema drift detected: ${errorMessage(error)}`);
    }
}

async function checkStorage(): Promise<OperatorHealthCheck> {
    try {
        const bucket = await getMediaBucket();
        await bucket.list({ limit: 1 });

        return pass('storage', 'Storage', 'R2 bucket reachable');
    } catch (error) {
        return fail('storage', 'Storage', `Storage check failed: ${errorMessage(error)}`);
    }
}

async function checkVimeo(
    settingsResult: SettingsResult<VimeoSettings>,
    tokenResult: SettingsResult<VimeoToken>,
): Promise<OperatorHealthCheck> {
    if (!settingsResult.ok) {
        return degraded(
            'vimeo',
            'Vimeo',
            `Vimeo check failed: ${errorMessage(settingsResult.error)}`,
        );
    }

    if (!tokenResult.ok) {
        return degraded('vimeo', 'Vimeo', `Vimeo check failed: ${errorMessage(tokenResult.error)}`);
    }
    const settings = settingsResult.value;
    const token = tokenResult.value;

    if (!token) {
        return degraded('vimeo', 'Vimeo', 'Vimeo token not configured', '/admin/settings');
    }

    if (settings?.status === 'failed' || settings?.status === 'invalid') {
        return degraded('vimeo', 'Vimeo', settings.lastError ?? `Status: ${settings.status}`);
    }

    return pass('vimeo', 'Vimeo', settings?.lastError ?? 'Vimeo token configured');
}

async function checkReuters(
    settingsResult: SettingsResult<ReutersSettings>,
): Promise<OperatorHealthCheck> {
    if (!settingsResult.ok) {
        return degraded(
            'reuters',
            'Reuters',
            `Reuters check failed: ${errorMessage(settingsResult.error)}`,
        );
    }
    const settings = settingsResult.value;

    if (settings?.lastError) {
        return degraded('reuters', 'Reuters', settings.lastError);
    }

    return pass(
        'reuters',
        'Reuters',
        settings?.hasSecret
            ? 'Reuters credentials configured; dynamic stream URLs are per block or override'
            : 'Manual Reuters HLS/RTMP endpoint entry is available',
    );
}

async function checkOutput(preloadedLiveSchedule?: LiveSchedule): Promise<OperatorHealthCheck> {
    if (!process.env.OUTPUT_CAPTURE_TOKEN) {
        return fail('output', 'Output', 'OUTPUT_CAPTURE_TOKEN missing', '/admin/output');
    }

    try {
        const live = preloadedLiveSchedule ?? (await getLiveSchedule());
        const override = await getActiveOutputOverride(live.day?.id);

        if (override?.sourceType === 'reuters') {
            return override.streamUrl
                ? pass(
                      'output',
                      'Output',
                      `Reuters override active: ${override.streamProtocol ?? 'stream'}`,
                  )
                : degraded(
                      'output',
                      'Output',
                      'Reuters override missing stream URL',
                      '/admin/output',
                  );
        }

        return live.day
            ? pass('output', 'Output', `Live day ${live.day.airDate} loaded`, '/admin/output')
            : degraded('output', 'Output', 'No live day loaded', '/admin/calendar');
    } catch (error) {
        return fail(
            'output',
            'Output',
            `Output check failed: ${errorMessage(error)}`,
            '/admin/output',
        );
    }
}

async function checkMigrations(): Promise<OperatorHealthCheck> {
    try {
        const db = await getDb();

        await Promise.all([
            db.select({ id: adminOperators.id }).from(adminOperators).limit(1),
            db
                .select({
                    operatorId: operatorPreferences.operatorId,
                    key: operatorPreferences.key,
                    value: operatorPreferences.value,
                })
                .from(operatorPreferences)
                .limit(1),
            db
                .select({
                    id: outputOverrides.id,
                    programDayId: outputOverrides.programDayId,
                    enabled: outputOverrides.enabled,
                })
                .from(outputOverrides)
                .limit(1),
            db
                .select({
                    id: guests.id,
                    status: guests.status,
                    sortOrder: guests.sortOrder,
                })
                .from(guests)
                .limit(1),
        ]);

        return pass('migrations', 'Migrations', 'D1 ops readiness tables are available');
    } catch (error) {
        return fail(
            'migrations',
            'Migrations',
            `D1 ops readiness migration missing or invalid: ${errorMessage(error)}`,
        );
    }
}

async function checkSmoke(): Promise<OperatorHealthCheck> {
    const smoke = await readSmokeStatus();

    if (!smoke) {
        return degraded('smoke', 'Smoke', 'No recent smoke status configured');
    }

    if (smoke.status === 'ok' && isSmokeStatusStale(smoke)) {
        return degraded('smoke', 'Smoke', smokeStatusMessage(smoke));
    }

    return isSmokeStatusOk(smoke)
        ? pass('smoke', 'Smoke', smokeStatusMessage(smoke))
        : fail('smoke', 'Smoke', smokeStatusMessage(smoke));
}

function pass(
    id: OperatorHealthCheck['id'],
    label: string,
    message: string,
    href?: string,
): OperatorHealthCheck {
    return href
        ? { id, label, ok: true, status: 'ok', message, href }
        : { id, label, ok: true, status: 'ok', message };
}

function degraded(
    id: OperatorHealthCheck['id'],
    label: string,
    message: string,
    href?: string,
): OperatorHealthCheck {
    return href
        ? { id, label, ok: true, status: 'degraded', message, href }
        : { id, label, ok: true, status: 'degraded', message };
}

function fail(
    id: OperatorHealthCheck['id'],
    label: string,
    message: string,
    href?: string,
): OperatorHealthCheck {
    return href
        ? { id, label, ok: false, status: 'fail', message, href }
        : { id, label, ok: false, status: 'fail', message };
}

function errorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
        return String((error as { message: unknown }).message);
    }

    return String(error);
}

function publicHealthMessage(status: OperatorHealthStatus) {
    if (status === 'ok') {
        return 'Check passed';
    }

    if (status === 'degraded') {
        return 'Check degraded';
    }

    return 'Check failed';
}
