import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type SmokeStatus = {
    status: string;
    label?: string;
    recordedAt?: string;
};

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;
const DEFAULT_SMOKE_STATUS_FILE = '/tmp/rtvplanner-smoke-status.json';

type SmokeEnv = Record<string, string | undefined>;

export function readSmokeStatus(env: SmokeEnv = process.env): SmokeStatus | null {
    if (env.RTV_LAST_SMOKE_STATUS) {
        return {
            status: env.RTV_LAST_SMOKE_STATUS,
            ...(env.RTV_LAST_SMOKE_LABEL ? { label: env.RTV_LAST_SMOKE_LABEL } : {}),
            ...(env.RTV_LAST_SMOKE_AT ? { recordedAt: env.RTV_LAST_SMOKE_AT } : {}),
        };
    }
    const path = smokeStatusPath(env);

    if (!existsSync(path)) {
        return null;
    }

    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8')) as SmokeStatus;

        return typeof parsed.status === 'string' ? parsed : null;
    } catch {
        return null;
    }
}

export function smokeStatusMessage(smoke: SmokeStatus, env: SmokeEnv = process.env) {
    const label = smoke.label ? `${smoke.label}: ` : '';

    if (isSmokeStatusStale(smoke, env)) {
        return `${label}latest smoke status is stale`;
    }

    return `${label}latest smoke status is ${smoke.status}`;
}

export function isSmokeStatusOk(smoke: SmokeStatus, env: SmokeEnv = process.env) {
    return smoke.status === 'ok' && !isSmokeStatusStale(smoke, env);
}

export function isSmokeStatusStale(smoke: SmokeStatus, env: SmokeEnv = process.env) {
    if (!smoke.recordedAt) {
        return false;
    }
    const recorded = Date.parse(smoke.recordedAt);

    if (!Number.isFinite(recorded)) {
        return true;
    }
    const maxAgeSeconds = Number(env.RTV_SMOKE_MAX_AGE_SECONDS || DEFAULT_MAX_AGE_SECONDS);
    const maxAge =
        Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0
            ? maxAgeSeconds
            : DEFAULT_MAX_AGE_SECONDS;

    return Date.now() - recorded > maxAge * 1000;
}

function smokeStatusPath(env: SmokeEnv) {
    return resolve(process.cwd(), env.RTV_SMOKE_STATUS_FILE || DEFAULT_SMOKE_STATUS_FILE);
}
