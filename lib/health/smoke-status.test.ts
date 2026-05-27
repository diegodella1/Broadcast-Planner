import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    isSmokeStatusOk,
    readSmokeStatus,
    smokeStatusMessage,
    writeSmokeStatus,
} from './smoke-status';

import { getCloudflareContext } from '@opennextjs/cloudflare';

vi.mock('@opennextjs/cloudflare', () => ({
    getCloudflareContext: vi.fn(),
}));

const mockGetCloudflareContext = vi.mocked(getCloudflareContext);

interface FakeKv {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
}

const buildKvContext = (kv: FakeKv) =>
    ({
        env: { SLIDE_DATA_KV: kv },
        cf: undefined,
        ctx: {},
    }) as unknown as Awaited<ReturnType<typeof getCloudflareContext>>;

const tempDirs: string[] = [];

beforeEach(() => {
    vi.clearAllMocks();
    mockGetCloudflareContext.mockRejectedValue(new Error('no worker context'));
});

afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});

describe('smoke status (file fallback)', () => {
    it('reads persisted smoke status from disk when KV is unavailable', async () => {
        const file = tempStatusFile({
            status: 'ok',
            label: 'local-deploy',
            recordedAt: new Date().toISOString(),
        });

        const smoke = await readSmokeStatus({ RTV_SMOKE_STATUS_FILE: file });

        expect(smoke?.status).toBe('ok');
        expect(smoke?.label).toBe('local-deploy');
        expect(smoke && isSmokeStatusOk(smoke, { RTV_SMOKE_STATUS_FILE: file })).toBe(true);
    });

    it('marks stale smoke status as not ok', async () => {
        const file = tempStatusFile({
            status: 'ok',
            label: 'old',
            recordedAt: '2026-01-01T00:00:00.000Z',
        });
        const smoke = await readSmokeStatus({
            RTV_SMOKE_STATUS_FILE: file,
            RTV_SMOKE_MAX_AGE_SECONDS: '1',
        });

        expect(
            smoke &&
                isSmokeStatusOk(smoke, {
                    RTV_SMOKE_STATUS_FILE: file,
                    RTV_SMOKE_MAX_AGE_SECONDS: '1',
                }),
        ).toBe(false);
        expect(
            smoke &&
                smokeStatusMessage(smoke, {
                    RTV_SMOKE_STATUS_FILE: file,
                    RTV_SMOKE_MAX_AGE_SECONDS: '1',
                }),
        ).toContain('stale');
    });

    it('returns null when no file exists and no KV/env override is set', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'rtv-smoke-'));
        tempDirs.push(dir);
        const file = join(dir, 'absent.json');

        const smoke = await readSmokeStatus({ RTV_SMOKE_STATUS_FILE: file });

        expect(smoke).toBeNull();
    });

    it('writes to disk when KV is unavailable', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'rtv-smoke-'));
        tempDirs.push(dir);
        const file = join(dir, 'written.json');
        const status = { status: 'ok', label: 'cli', recordedAt: '2026-05-26T00:00:00.000Z' };

        await writeSmokeStatus(status, { RTV_SMOKE_STATUS_FILE: file });

        expect(existsSync(file)).toBe(true);
        expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(status);
    });
});

describe('smoke status (KV-backed)', () => {
    it('reads cached smoke status from KV on hit', async () => {
        const kv: FakeKv = {
            get: vi.fn().mockResolvedValue({ status: 'ok', label: 'prod', recordedAt: nowIso() }),
            put: vi.fn().mockResolvedValue(undefined),
        };
        mockGetCloudflareContext.mockReset();
        mockGetCloudflareContext.mockResolvedValue(buildKvContext(kv));

        const smoke = await readSmokeStatus({});

        expect(smoke?.status).toBe('ok');
        expect(smoke?.label).toBe('prod');
        expect(kv.get).toHaveBeenCalledWith('smoke:status', 'json');
    });

    it('falls back to file when KV returns null', async () => {
        const kv: FakeKv = {
            get: vi.fn().mockResolvedValue(null),
            put: vi.fn().mockResolvedValue(undefined),
        };
        mockGetCloudflareContext.mockReset();
        mockGetCloudflareContext.mockResolvedValue(buildKvContext(kv));
        const file = tempStatusFile({ status: 'ok', label: 'fallback', recordedAt: nowIso() });

        const smoke = await readSmokeStatus({ RTV_SMOKE_STATUS_FILE: file });

        expect(smoke?.label).toBe('fallback');
    });

    it('writes smoke status to KV when binding is present', async () => {
        const kv: FakeKv = {
            get: vi.fn(),
            put: vi.fn().mockResolvedValue(undefined),
        };
        mockGetCloudflareContext.mockReset();
        mockGetCloudflareContext.mockResolvedValue(buildKvContext(kv));
        const status = { status: 'ok', label: 'kv', recordedAt: nowIso() };

        await writeSmokeStatus(status, {});

        expect(kv.put).toHaveBeenCalledWith('smoke:status', JSON.stringify(status));
    });

    it('treats invalid KV payload as cache miss', async () => {
        const kv: FakeKv = {
            get: vi.fn().mockResolvedValue({ notAStatus: true }),
            put: vi.fn().mockResolvedValue(undefined),
        };
        mockGetCloudflareContext.mockReset();
        mockGetCloudflareContext.mockResolvedValue(buildKvContext(kv));

        const smoke = await readSmokeStatus({});

        expect(smoke).toBeNull();
    });

    it('falls back to file when KV.get throws', async () => {
        const kv: FakeKv = {
            get: vi.fn().mockRejectedValue(new Error('kv timeout')),
            put: vi.fn().mockResolvedValue(undefined),
        };
        mockGetCloudflareContext.mockReset();
        mockGetCloudflareContext.mockResolvedValue(buildKvContext(kv));
        const file = tempStatusFile({ status: 'ok', label: 'after-err', recordedAt: nowIso() });

        const smoke = await readSmokeStatus({ RTV_SMOKE_STATUS_FILE: file });

        expect(smoke?.label).toBe('after-err');
    });
});

function tempStatusFile(payload: unknown) {
    const dir = mkdtempSync(join(tmpdir(), 'rtv-smoke-'));
    tempDirs.push(dir);
    const file = join(dir, 'smoke-status.json');
    writeFileSync(file, JSON.stringify(payload));

    return file;
}

function nowIso() {
    return new Date().toISOString();
}
