import type { SlideAsset } from '@/lib/types';

export type YouTubeSlideConfig = {
    videoId: string;
    zoom: 1 | 1.25;
    muted: boolean;
    loop: boolean;
    startSeconds: number;
};

export function parseYouTubeVideoId(input: string) {
    const value = input.trim();

    if (!value) {
        return null;
    }

    if (/^[A-Za-z0-9_-]{11}$/.test(value)) {
        return value;
    }

    try {
        const url = new URL(value);
        const host = url.hostname.replace(/^www\./, '');

        if (host === 'youtu.be') {
            return safeVideoId(url.pathname.slice(1).split('/')[0] ?? '');
        }

        if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
            if (url.pathname.startsWith('/embed/')) {
                return safeVideoId(url.pathname.split('/')[2] ?? '');
            }

            if (url.pathname.startsWith('/shorts/')) {
                return safeVideoId(url.pathname.split('/')[2] ?? '');
            }

            return safeVideoId(url.searchParams.get('v') ?? '');
        }
    } catch {
        return null;
    }

    return null;
}

export function youtubeSlideMetadata(input: {
    url: string;
    zoom?: number | string | undefined;
    muted?: boolean | string | undefined;
    loop?: boolean | string | undefined;
    startSeconds?: number | string | undefined;
}) {
    const videoId = parseYouTubeVideoId(input.url);

    if (!videoId) {
        return null;
    }

    return {
        youtubeUrl: input.url.trim(),
        youtubeVideoId: videoId,
        youtubeZoom: normalizeZoom(input.zoom),
        youtubeMuted: normalizeBoolean(input.muted, true),
        youtubeLoop: normalizeBoolean(input.loop, true),
        youtubeStartSeconds: normalizePositiveInteger(input.startSeconds, 0),
    };
}

export function getYouTubeSlideConfig(slide: SlideAsset | null | undefined) {
    if (!isYouTubeSlide(slide)) {
        return null;
    }
    const metadata = slide?.metadata ?? {};
    const videoId = parseYouTubeVideoId(
        stringMetadata(metadata.youtubeVideoId) || stringMetadata(metadata.youtubeUrl),
    );

    if (!videoId) {
        return null;
    }

    return {
        videoId,
        zoom: normalizeZoom(metadata.youtubeZoom),
        muted: normalizeBoolean(metadata.youtubeMuted, true),
        loop: normalizeBoolean(metadata.youtubeLoop, true),
        startSeconds: normalizePositiveInteger(metadata.youtubeStartSeconds, 0),
    } satisfies YouTubeSlideConfig;
}

export function isYouTubeSlide(slide: SlideAsset | null | undefined) {
    return (
        slide?.slideType === 'html' &&
        Boolean(
            stringMetadata(slide.metadata?.youtubeVideoId) ||
            stringMetadata(slide.metadata?.youtubeUrl),
        )
    );
}

export function youTubeEmbedUrl(config: YouTubeSlideConfig) {
    const params = new URLSearchParams({
        autoplay: '1',
        controls: '0',
        disablekb: '1',
        fs: '0',
        iv_load_policy: '3',
        modestbranding: '1',
        playsinline: '1',
        rel: '0',
        mute: config.muted ? '1' : '0',
    });

    if (config.loop) {
        params.set('loop', '1');
        params.set('playlist', config.videoId);
    }

    if (config.startSeconds > 0) {
        params.set('start', String(config.startSeconds));
    }

    return `https://www.youtube-nocookie.com/embed/${config.videoId}?${params.toString()}`;
}

function safeVideoId(value: string) {
    return /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
}

function stringMetadata(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeZoom(value: unknown): 1 | 1.25 {
    return Number(value) === 1.25 ? 1.25 : 1;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        if (['true', '1', 'on', 'yes'].includes(value.toLowerCase())) {
            return true;
        }

        if (['false', '0', 'off', 'no'].includes(value.toLowerCase())) {
            return false;
        }
    }

    return fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number) {
    const parsed = Math.round(Number(value));

    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }

    return parsed;
}
