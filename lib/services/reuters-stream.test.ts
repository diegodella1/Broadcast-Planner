import { describe, expect, it } from 'vitest';

import { maskStreamUrl, parseReutersStreamInput, protocolForReutersUrl } from './reuters-stream';

describe('Reuters dynamic stream config', () => {
    it('accepts HLS and RTMP URLs', () => {
        expect(protocolForReutersUrl('https://reuters.example/live/channel.m3u8?token=abc')).toBe(
            'hls',
        );
        expect(protocolForReutersUrl('rtmp://reuters.example/live/channel')).toBe('rtmp');
    });

    it('rejects unsupported stream URLs', () => {
        expect(() => parseReutersStreamInput({ url: 'https://reuters.example/live.mp4' })).toThrow(
            'Reuters stream must be an HLS',
        );
    });

    it('normalizes labels, expiry and masked URL metadata', () => {
        const parsed = parseReutersStreamInput({
            url: 'https://reuters.example/live/channel.m3u8?signature=secret',
            label: 'Reuters Markets',
            expiresAt: '2026-05-18T14:00:00.000Z',
        });

        expect(parsed).toEqual({
            protocol: 'hls',
            url: 'https://reuters.example/live/channel.m3u8?signature=secret',
            label: 'Reuters Markets',
            expiresAt: '2026-05-18T14:00:00.000Z',
        });
        expect(maskStreamUrl(parsed!.url)).toBe('https://reuters.example/live/channel.m3u8?...');
    });
});
