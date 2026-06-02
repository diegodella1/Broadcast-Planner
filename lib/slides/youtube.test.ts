import { describe, expect, it } from 'vitest';

import {
    getYouTubeSlideConfig,
    parseYouTubeVideoId,
    youTubeEmbedUrl,
    youtubeSlideMetadata,
} from './youtube';

describe('youtube helpers', () => {
    it('parses youtube ids from common urls', () => {
        expect(parseYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
        expect(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
        expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5s')).toBe(
            'dQw4w9WgXcQ',
        );
    });

    it('builds embed urls with hidden controls and loop', () => {
        const url = youTubeEmbedUrl({
            videoId: 'dQw4w9WgXcQ',
            zoom: 1.25,
            muted: true,
            loop: true,
            startSeconds: 7,
        });

        expect(url).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
        expect(url).toContain('controls=0');
        expect(url).toContain('loop=1');
        expect(url).toContain('playlist=dQw4w9WgXcQ');
        expect(url).toContain('start=7');
    });

    it('reads youtube config from html slides metadata', () => {
        const metadata = youtubeSlideMetadata({
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            zoom: '1.25',
            muted: true,
            loop: true,
            startSeconds: 9,
        });

        const config = getYouTubeSlideConfig({
            id: 'slide-youtube-1',
            title: 'YouTube',
            slideType: 'html',
            content: null,
            imageUrl: null,
            htmlContent: null,
            templateId: null,
            defaultDurationSeconds: 30,
            status: 'ready',
            metadata,
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
        });

        expect(config).toEqual({
            videoId: 'dQw4w9WgXcQ',
            zoom: 1.25,
            muted: true,
            loop: true,
            startSeconds: 9,
        });
    });
});
