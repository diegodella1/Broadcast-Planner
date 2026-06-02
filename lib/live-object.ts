import type { ProgramBlock } from './types';

export type LiveSourceType = 'youtube' | 'hls';
export type LiveStatus = 'scheduled' | 'on_air' | 'ended' | 'failed';
export type LiveEndReason = 'youtube-ended' | 'hls-ended' | 'dead-timeout' | 'manual' | 'failed';

export type LiveObjectConfig = {
    sourceType: LiveSourceType;
    url: string;
    title?: string;
    youtubeVideoId?: string;
    hlsUrl?: string;
    status: LiveStatus;
    startedAt?: string | null;
    endedAt?: string | null;
    endReason?: string | null;
};

export const LIVE_ESTIMATED_DURATION_SECONDS = 3600;

export function isLiveObjectBlock(block: ProgramBlock | null | undefined) {
    return block?.metadata?.live_object === true;
}

export function isLiveObjectEnded(block: ProgramBlock | null | undefined) {
    const status = liveStatus(block?.metadata);

    return status === 'ended' || status === 'failed';
}

export function getLiveObjectConfig(
    block: ProgramBlock | null | undefined,
): LiveObjectConfig | null {
    if (!isLiveObjectBlock(block)) {
        return null;
    }
    const metadata = block?.metadata ?? {};
    const sourceType = metadata.live_source_type === 'hls' ? 'hls' : 'youtube';
    const url = stringMetadata(metadata.live_url);
    const youtubeVideoId =
        sourceType === 'youtube'
            ? parseYouTubeVideoId(stringMetadata(metadata.youtube_video_id) || url)
            : null;
    const hlsUrl = sourceType === 'hls' ? stringMetadata(metadata.hls_url) || url : '';

    if (sourceType === 'youtube' && !youtubeVideoId) {
        return null;
    }

    if (sourceType === 'hls' && !hlsUrl) {
        return null;
    }

    return {
        sourceType,
        url,
        status: liveStatus(metadata),
        startedAt: stringMetadata(metadata.live_started_at) || null,
        endedAt: stringMetadata(metadata.live_ended_at) || null,
        endReason: stringMetadata(metadata.live_end_reason) || null,
        ...(stringMetadata(metadata.live_title) || block?.title
            ? { title: stringMetadata(metadata.live_title) || block?.title || '' }
            : {}),
        ...(youtubeVideoId ? { youtubeVideoId } : {}),
        ...(hlsUrl ? { hlsUrl } : {}),
    };
}

export function buildLiveObjectMetadata(input: {
    sourceType: string;
    url: string;
    title?: string;
}) {
    const sourceType = input.sourceType === 'hls' ? 'hls' : 'youtube';
    const url = input.url.trim();

    if (!url) {
        return null;
    }

    if (sourceType === 'youtube') {
        const youtubeVideoId = parseYouTubeVideoId(url);

        if (!youtubeVideoId) {
            return null;
        }

        return {
            live_object: true,
            live_source_type: 'youtube',
            live_url: url,
            live_title: input.title?.trim() || null,
            live_status: 'scheduled',
            youtube_video_id: youtubeVideoId,
        };
    }

    if (!isValidHlsUrl(url)) {
        return null;
    }

    return {
        live_object: true,
        live_source_type: 'hls',
        live_url: url,
        live_title: input.title?.trim() || null,
        live_status: 'scheduled',
        hls_url: url,
    };
}

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

export function youtubeLiveEmbedUrl(videoId: string) {
    const params = new URLSearchParams({
        autoplay: '1',
        controls: '0',
        disablekb: '1',
        fs: '0',
        iv_load_policy: '3',
        modestbranding: '1',
        playsinline: '1',
        rel: '0',
    });

    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function isValidHlsUrl(value: string) {
    try {
        const url = new URL(value);

        return (
            (url.protocol === 'https:' || url.protocol === 'http:') &&
            url.pathname.includes('.m3u8')
        );
    } catch {
        return false;
    }
}

function liveStatus(metadata: Record<string, unknown> | null | undefined): LiveStatus {
    const value = metadata?.live_status;

    if (value === 'on_air' || value === 'ended' || value === 'failed') {
        return value;
    }

    return 'scheduled';
}

function safeVideoId(value: string) {
    return /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
}

function stringMetadata(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}
