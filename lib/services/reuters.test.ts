import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getReutersClient } from './reuters';

describe('getReutersClient (fixtures provider)', () => {
    const originalProvider = process.env.REUTERS_PROVIDER;

    beforeEach(() => {
        delete process.env.REUTERS_PROVIDER;
    });

    afterEach(() => {
        if (originalProvider === undefined) {
            delete process.env.REUTERS_PROVIDER;
        } else {
            process.env.REUTERS_PROVIDER = originalProvider;
        }
    });

    it('returns the fixtures client by default', async () => {
        const client = await getReutersClient();
        expect(client).toBeDefined();
        expect(typeof client.listLiveChannels).toBe('function');
        expect(typeof client.getChannelStreamUrl).toBe('function');
    });

    it('returns the fixtures client when REUTERS_PROVIDER=fixtures', async () => {
        process.env.REUTERS_PROVIDER = 'fixtures';
        const client = await getReutersClient();
        const channels = await client.listLiveChannels();
        expect(channels.length).toBeGreaterThan(0);
    });

    it('listLiveChannels returns 5 fixture channels with the required shape', async () => {
        const client = await getReutersClient();
        const channels = await client.listLiveChannels();
        expect(channels).toHaveLength(5);

        for (const c of channels) {
            expect(typeof c.id).toBe('string');
            expect(c.id.length).toBeGreaterThan(0);
            expect(typeof c.name).toBe('string');
            expect(c.name.length).toBeGreaterThan(0);
            expect(typeof c.hlsUrl).toBe('string');
            expect(c.hlsUrl).toMatch(/^https?:\/\//);
        }
        const ids = channels.map((c) => c.id);
        expect(ids).toContain('top-news-hd');
        expect(ids).toContain('markets-hd');
        expect(ids).toContain('weather-hd');
    });

    it('getChannelStreamUrl returns the URL for a known channel', async () => {
        const client = await getReutersClient();
        const url = await client.getChannelStreamUrl('top-news-hd');
        expect(url).toBe('https://example.com/reuters/top-news-hd.m3u8');
    });

    it('getChannelStreamUrl throws for an unknown channel', async () => {
        const client = await getReutersClient();
        await expect(client.getChannelStreamUrl('does-not-exist')).rejects.toThrow(
            /unknown channel does-not-exist/,
        );
    });

    it('each fixture channel has a category from the allowed set', async () => {
        const client = await getReutersClient();
        const channels = await client.listLiveChannels();
        const allowed = new Set(['news', 'markets', 'sports', 'weather']);

        for (const c of channels) {
            expect(allowed.has(String(c.category))).toBe(true);
        }
    });
});

describe('getReutersClient (real provider)', () => {
    const originalProvider = process.env.REUTERS_PROVIDER;

    afterEach(() => {
        if (originalProvider === undefined) {
            delete process.env.REUTERS_PROVIDER;
        } else {
            process.env.REUTERS_PROVIDER = originalProvider;
        }
    });

    it('throws an explicit not-implemented error when REUTERS_PROVIDER=real', async () => {
        process.env.REUTERS_PROVIDER = 'real';
        await expect(getReutersClient()).rejects.toThrow(/not implemented/i);
    });

    it('error message points operators to lib/reuters-real.ts as the swap target', async () => {
        process.env.REUTERS_PROVIDER = 'real';
        await expect(getReutersClient()).rejects.toThrow(/lib\/reuters-real\.ts/);
    });
});
