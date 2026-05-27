import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withKvCache } from './kv-cache';

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

describe('withKvCache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('falls back to the fetcher when the Cloudflare context is unavailable', async () => {
        mockGetCloudflareContext.mockRejectedValueOnce(new Error('no worker context'));
        const fetcher = vi.fn().mockResolvedValue({ value: 'fresh' });

        const result = await withKvCache('test:key', 60, fetcher);

        expect(result).toEqual({ value: 'fresh' });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('falls back to the fetcher when the KV binding is missing', async () => {
        mockGetCloudflareContext.mockResolvedValueOnce({
            env: {},
            cf: undefined,
            ctx: {},
        } as unknown as Awaited<ReturnType<typeof getCloudflareContext>>);
        const fetcher = vi.fn().mockResolvedValue({ value: 'fresh' });

        const result = await withKvCache('test:key', 60, fetcher);

        expect(result).toEqual({ value: 'fresh' });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('returns the cached value on hit without invoking the fetcher', async () => {
        const kv: FakeKv = {
            get: vi.fn().mockResolvedValue({ cached: true, n: 7 }),
            put: vi.fn().mockResolvedValue(undefined),
        };
        mockGetCloudflareContext.mockResolvedValueOnce(buildKvContext(kv));
        const fetcher = vi.fn();

        const result = await withKvCache('test:key', 60, fetcher);

        expect(result).toEqual({ cached: true, n: 7 });
        expect(fetcher).not.toHaveBeenCalled();
        expect(kv.get).toHaveBeenCalledWith('test:key', 'json');
        expect(kv.put).not.toHaveBeenCalled();
    });

    it('fetches fresh data and writes through to KV on miss', async () => {
        const kv: FakeKv = {
            get: vi.fn().mockResolvedValue(null),
            put: vi.fn().mockResolvedValue(undefined),
        };
        mockGetCloudflareContext.mockResolvedValueOnce(buildKvContext(kv));
        const fetcher = vi.fn().mockResolvedValue({ value: 'fresh', n: 3 });

        const result = await withKvCache('test:key', 90, fetcher);

        expect(result).toEqual({ value: 'fresh', n: 3 });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(kv.put).toHaveBeenCalledWith('test:key', JSON.stringify({ value: 'fresh', n: 3 }), {
            expirationTtl: 90,
        });
    });

    it('falls back to the fetcher when KV.get throws', async () => {
        const kv: FakeKv = {
            get: vi.fn().mockRejectedValue(new Error('kv timeout')),
            put: vi.fn().mockResolvedValue(undefined),
        };
        mockGetCloudflareContext.mockResolvedValueOnce(buildKvContext(kv));
        const fetcher = vi.fn().mockResolvedValue({ value: 'fresh' });

        const result = await withKvCache('test:key', 60, fetcher);

        expect(result).toEqual({ value: 'fresh' });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(kv.put).not.toHaveBeenCalled();
    });

    it('still returns fresh data when KV.put throws', async () => {
        const kv: FakeKv = {
            get: vi.fn().mockResolvedValue(null),
            put: vi.fn().mockRejectedValue(new Error('kv write failed')),
        };
        mockGetCloudflareContext.mockResolvedValueOnce(buildKvContext(kv));
        const fetcher = vi.fn().mockResolvedValue({ value: 'fresh' });

        const result = await withKvCache('test:key', 60, fetcher);

        expect(result).toEqual({ value: 'fresh' });
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
