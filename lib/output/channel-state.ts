import { appUrl } from '@/lib/helpers/app-url';
import { getLiveSchedule, getPlaybackScheduleForBlock } from '@/lib/data';
import { getGlobalFallbackCarousel, selectFallbackCarouselSlide } from '@/lib/fallback-carousel';
import { getLatestMusicPreference } from '@/lib/operator-preferences';
import { getActiveOutputOverride } from '@/lib/output-overrides';
import { recordedBugFromBlock } from '@/lib/recorded-bug';
import { getLiveObjectConfig, youtubeLiveEmbedUrl } from '@/lib/live-object';
import { findPlayableFallback } from '@/lib/scheduling/fallback';
import { findActiveLayers, findActiveSchedule } from '@/lib/scheduling/scheduler';
import { PLAYOUT_TIMEZONE, secondsSinceMidnightInTimezone } from '@/lib/helpers/time';
import { isYouTubeSlide } from '@/lib/slides/youtube';

import type { MediaAsset, OutputOverride, ScheduleBundle, SlideAsset } from '@/lib/types';

export type ChannelStateInputs = {
    now: Date;
    previewBlockId: string | null;
    requestedStartAt: number | null;
    mediaAccessToken: string;
};

export type ChannelStateBase = {
    serverSeconds: number;
    generatedAt: string;
};

type ActiveSchedule = ReturnType<typeof findActiveSchedule>;
type BackgroundMusic = Awaited<ReturnType<typeof backgroundMusicForActive>>;

export async function composeChannelState(inputs: ChannelStateInputs) {
    const { now, previewBlockId, requestedStartAt, mediaAccessToken } = inputs;
    const hasRequestedStartAt = requestedStartAt !== null && Number.isFinite(requestedStartAt);
    const bundle = previewBlockId
        ? await getPlaybackScheduleForBlock(previewBlockId)
        : await getLiveSchedule(now);
    const timezone = bundle.day?.timezone ?? PLAYOUT_TIMEZONE;
    const secondsOfDay = computeSecondsOfDay({
        bundle,
        previewBlockId,
        requestedStartAt,
        hasRequestedStartAt,
        now,
        timezone,
    });
    const active = previewBlockId
        ? previewActiveSchedule(
              bundle,
              previewBlockId,
              hasRequestedStartAt && requestedStartAt !== null ? Math.max(0, requestedStartAt) : 0,
          )
        : findActiveSchedule(bundle, secondsOfDay);
    const [override, music] = await Promise.all([
        getActiveOutputOverride(bundle.day?.id),
        backgroundMusicForActive(bundle, active, mediaAccessToken),
    ]);
    const base: ChannelStateBase = {
        serverSeconds: secondsOfDay,
        generatedAt: now.toISOString(),
    };

    return resolveChannelState({ bundle, active, override, music, base, mediaAccessToken });
}

type ResolveChannelStateArgs = {
    bundle: ScheduleBundle;
    active: ActiveSchedule;
    override: OutputOverride | null;
    music: BackgroundMusic;
    base: ChannelStateBase;
    mediaAccessToken: string;
};

async function resolveChannelState(args: ResolveChannelStateArgs) {
    const { bundle, active, override, music, base, mediaAccessToken } = args;

    if (bundle.day && override?.sourceType === 'reuters' && override.streamUrl) {
        return reutersOverrideState(override, base, music);
    }

    if (!bundle.day || !active.block) {
        return fallbackStateForBundle(bundle, 'no-active-block', base, mediaAccessToken, music);
    }
    const startOffsetSeconds = Math.max(0, Math.floor(active.elapsedInBlock));
    const reutersUrl = metadataText(active.block.metadata, 'reuters_stream_url');
    const liveConfig = getLiveObjectConfig(active.block);

    if (liveConfig) {
        return liveBlockState(active.block, liveConfig, base, music);
    }

    if (reutersUrl) {
        return reutersBlockState(active.block, reutersUrl, base, music);
    }
    const stateArgs = { active, base, music, mediaAccessToken, startOffsetSeconds };

    if (active.slide) {
        return slideBlockState(stateArgs);
    }

    if (active.asset) {
        const assetState = await assetBlockState({ ...stateArgs, bundle });

        if (assetState) {
            return assetState;
        }
    }

    return fallbackStateForBundle(
        bundle,
        'unsupported-active-content',
        base,
        mediaAccessToken,
        music,
    );
}

function computeSecondsOfDay(args: {
    bundle: ScheduleBundle;
    previewBlockId: string | null;
    requestedStartAt: number | null;
    hasRequestedStartAt: boolean;
    now: Date;
    timezone: string;
}) {
    const { bundle, previewBlockId, requestedStartAt, hasRequestedStartAt, now, timezone } = args;

    if (previewBlockId) {
        const blockStart =
            bundle.blocks.find((block) => block.id === previewBlockId)?.startTimeSeconds ?? 0;
        const offset =
            hasRequestedStartAt && requestedStartAt !== null ? Math.max(0, requestedStartAt) : 0;

        return blockStart + offset;
    }

    if (hasRequestedStartAt && requestedStartAt !== null) {
        return requestedStartAt;
    }

    return secondsSinceMidnightInTimezone(now, timezone);
}

function reutersOverrideState(
    override: NonNullable<OutputOverride>,
    base: ChannelStateBase,
    music: BackgroundMusic,
) {
    return {
        ...base,
        kind: 'hls' as const,
        signature: `reuters-override:${override.id}:${override.updatedAt}`,
        blockId: override.blockId,
        title: override.label ?? 'Reuters live',
        hlsUrl: override.streamUrl,
        startOffsetSeconds: 0,
        durationSeconds: null,
        sourceType: 'reuters' as const,
        streamProtocol: override.streamProtocol,
        backgroundMusic: suppressBackgroundMusic(music),
    };
}

function reutersBlockState(
    block: NonNullable<ActiveSchedule['block']>,
    reutersUrl: string,
    base: ChannelStateBase,
    music: BackgroundMusic,
) {
    return {
        ...base,
        kind: 'hls' as const,
        signature: `reuters:${block.id}:${metadataText(block.metadata, 'reuters_stream_refreshed_at')}`,
        blockId: block.id,
        title: metadataText(block.metadata, 'reuters_stream_label') || block.title,
        hlsUrl: reutersUrl,
        startOffsetSeconds: 0,
        durationSeconds: block.durationSeconds,
        sourceType: 'reuters' as const,
        streamProtocol: metadataText(block.metadata, 'reuters_stream_protocol') || 'hls',
        backgroundMusic: suppressBackgroundMusic(music),
    };
}

function liveBlockState(
    block: NonNullable<ActiveSchedule['block']>,
    live: NonNullable<ReturnType<typeof getLiveObjectConfig>>,
    base: ChannelStateBase,
    music: BackgroundMusic,
) {
    const common = {
        ...base,
        blockId: block.id,
        title: live.title || block.title,
        startOffsetSeconds: 0,
        durationSeconds: null,
        live: true,
        liveSourceType: live.sourceType,
        liveStatus: live.status,
        lowerThird: live.lowerThird,
        backgroundMusic: suppressBackgroundMusic(music),
    };

    if (live.sourceType === 'youtube' && live.youtubeVideoId) {
        return {
            ...common,
            kind: 'youtube_live' as const,
            signature: `youtube-live:${block.id}:${live.youtubeVideoId}:${live.status}`,
            youtubeVideoId: live.youtubeVideoId,
            youtubeUrl: live.url,
            embedUrl: youtubeLiveEmbedUrl(live.youtubeVideoId),
        };
    }

    if (live.sourceType === 'hls' && live.hlsUrl) {
        return {
            ...common,
            kind: 'hls' as const,
            signature: `hls-live:${block.id}:${live.hlsUrl}:${live.status}`,
            hlsUrl: live.hlsUrl,
            sourceType: 'live' as const,
            streamProtocol: 'hls' as const,
        };
    }

    return fallbackState('invalid-live-object', base, suppressBackgroundMusic(music));
}

type ActiveBlockStateArgs = {
    active: ActiveSchedule;
    base: ChannelStateBase;
    music: BackgroundMusic;
    mediaAccessToken: string;
    startOffsetSeconds: number;
};

function slideBlockState(args: ActiveBlockStateArgs) {
    const { active, base, music, mediaAccessToken, startOffsetSeconds } = args;

    if (!active.block || !active.slide) {
        return null;
    }
    const renderUrl = appUrl(`/output/slide/${active.slide.id}`);

    if (mediaAccessToken) {
        renderUrl.searchParams.set('token', mediaAccessToken);
    }

    return {
        ...base,
        kind: 'slide' as const,
        signature: `slide:${active.block.id}:${active.slide.id}:${active.slide.updatedAt}`,
        blockId: active.block.id,
        title: active.slide.title,
        slideId: active.slide.id,
        templateId: active.slide.templateId,
        ...(shouldRenderSlideInIframe(active.slide) ? { renderUrl: renderUrl.toString() } : {}),
        ...(active.slide.imageUrl ? { imageUrl: active.slide.imageUrl } : {}),
        ...(active.slide.content || active.slide.htmlContent
            ? { content: active.slide.content ?? active.slide.htmlContent ?? '' }
            : {}),
        startOffsetSeconds,
        durationSeconds: active.block.durationSeconds,
        backgroundMusic: slideBackgroundMusic(active.slide, music),
    };
}

async function assetBlockState(args: ActiveBlockStateArgs & { bundle: ScheduleBundle }) {
    const { active, base, music, mediaAccessToken, startOffsetSeconds } = args;

    if (!active.block || !active.asset || active.asset.status !== 'ready') {
        return null;
    }

    if (active.asset.playbackKind === 'hls' && active.asset.url) {
        return hlsAssetState({ active, base, music, mediaAccessToken, startOffsetSeconds });
    }

    if (active.asset.playbackKind === 'video_file' && active.asset.url) {
        return mp4AssetState({ active, base, music, mediaAccessToken, startOffsetSeconds });
    }

    if (active.asset.playbackKind === 'image' && active.asset.url) {
        return imageAssetState({ active, base, music, mediaAccessToken, startOffsetSeconds });
    }

    if (active.asset.playbackKind === 'embed' && active.asset.url) {
        return embedAssetState({ active, base, music, mediaAccessToken, startOffsetSeconds });
    }

    if (active.asset.playbackKind === 'audio' && active.asset.url) {
        return audioAssetState({ active, base, music, mediaAccessToken, startOffsetSeconds });
    }

    return null;
}

function hlsAssetState(args: ActiveBlockStateArgs) {
    const { active, base, music, mediaAccessToken, startOffsetSeconds } = args;

    if (!active.block || !active.asset || !active.asset.url) {
        return null;
    }

    return {
        ...base,
        kind: 'hls' as const,
        signature: `hls:${active.block.id}:${active.asset.id}`,
        blockId: active.block.id,
        assetId: active.asset.id,
        title: active.asset.title,
        hlsUrl: withMediaAccessToken(active.asset.url, mediaAccessToken),
        startOffsetSeconds,
        durationSeconds: active.asset.durationSeconds,
        ...videoPresentation(active.asset),
        ...recordedBugPresentation(active.block),
        backgroundMusic: suppressBackgroundMusic(music),
    };
}

function mp4AssetState(args: ActiveBlockStateArgs) {
    const { active, base, music, mediaAccessToken, startOffsetSeconds } = args;

    if (!active.block || !active.asset || !active.asset.url) {
        return null;
    }

    return {
        ...base,
        kind: 'mp4' as const,
        signature: `mp4:${active.block.id}:${active.asset.id}`,
        blockId: active.block.id,
        assetId: active.asset.id,
        title: active.asset.title,
        url: withMediaAccessToken(active.asset.url, mediaAccessToken),
        startOffsetSeconds,
        durationSeconds: active.asset.durationSeconds ?? active.block.durationSeconds,
        ...videoPresentation(active.asset),
        ...recordedBugPresentation(active.block),
        backgroundMusic: suppressBackgroundMusic(music),
    };
}

function imageAssetState(args: ActiveBlockStateArgs) {
    const { active, base, music, mediaAccessToken, startOffsetSeconds } = args;

    if (!active.block || !active.asset || !active.asset.url) {
        return null;
    }

    return {
        ...base,
        kind: 'image' as const,
        signature: `image:${active.block.id}:${active.asset.id}`,
        blockId: active.block.id,
        assetId: active.asset.id,
        title: active.asset.title,
        imageUrl: withMediaAccessToken(active.asset.url, mediaAccessToken),
        startOffsetSeconds,
        durationSeconds: active.block.durationSeconds,
        backgroundMusic: music,
    };
}

function embedAssetState(args: ActiveBlockStateArgs) {
    const { active, base, music, startOffsetSeconds } = args;

    if (!active.block || !active.asset?.url) {
        return null;
    }

    return {
        ...base,
        kind: 'embed' as const,
        signature: `embed:${active.block.id}:${active.asset.id}:${active.asset.updatedAt}`,
        blockId: active.block.id,
        assetId: active.asset.id,
        title: active.asset.title,
        embedUrl: active.asset.url,
        startOffsetSeconds,
        durationSeconds: active.asset.durationSeconds ?? active.block.durationSeconds,
        backgroundMusic: suppressBackgroundMusic(music),
    };
}

function audioAssetState(args: ActiveBlockStateArgs) {
    const { active, base, music, mediaAccessToken, startOffsetSeconds } = args;

    if (!active.block || !active.asset?.url) {
        return null;
    }

    return {
        ...base,
        kind: 'audio' as const,
        signature: `audio:${active.block.id}:${active.asset.id}`,
        blockId: active.block.id,
        assetId: active.asset.id,
        title: active.asset.title,
        url: withMediaAccessToken(active.asset.url, mediaAccessToken),
        startOffsetSeconds,
        durationSeconds: active.asset.durationSeconds ?? active.block.durationSeconds,
        backgroundMusic: suppressBackgroundMusic(music),
    };
}

async function fallbackStateForBundle(
    bundle: ScheduleBundle,
    reason: string,
    base: ChannelStateBase,
    mediaAccessToken = '',
    backgroundMusic: BackgroundMusic = null,
) {
    const fallbackAsset = findFallbackLoopAsset(bundle);

    if (fallbackAsset) {
        const loopState = await fallbackVideoState(fallbackAsset, reason, base, mediaAccessToken);

        if (loopState) {
            return loopState;
        }
    }

    const carouselState = await fallbackCarouselState(
        bundle,
        reason,
        base,
        mediaAccessToken,
        backgroundMusic,
    );

    if (carouselState) {
        return carouselState;
    }

    return fallbackState(reason, base, backgroundMusic);
}

async function fallbackCarouselState(
    bundle: ScheduleBundle,
    reason: string,
    base: ChannelStateBase,
    mediaAccessToken = '',
    backgroundMusic: BackgroundMusic = null,
) {
    const selection = selectFallbackCarouselSlide(
        await getGlobalFallbackCarousel(),
        bundle,
        base.serverSeconds,
    );

    if (!selection) {
        return null;
    }

    if (selection.kind === 'asset' && selection.asset) {
        return fallbackCarouselAssetState(
            selection.asset,
            selection,
            reason,
            base,
            mediaAccessToken,
        );
    }

    if (!selection.slide) {
        return null;
    }
    const renderUrl = appUrl(`/output/slide/${selection.slide.id}`);

    if (mediaAccessToken) {
        renderUrl.searchParams.set('token', mediaAccessToken);
    }

    return {
        ...base,
        kind: 'slide' as const,
        signature: `fallback-carousel:${selection.slide.id}:${selection.index}:${selection.slide.updatedAt}:${selection.carouselUpdatedAt}`,
        reason,
        blockId: null,
        title: selection.slide.title,
        slideId: selection.slide.id,
        templateId: selection.slide.templateId,
        ...(shouldRenderSlideInIframe(selection.slide) ? { renderUrl: renderUrl.toString() } : {}),
        ...(selection.slide.imageUrl ? { imageUrl: selection.slide.imageUrl } : {}),
        ...(selection.slide.content || selection.slide.htmlContent
            ? { content: selection.slide.content ?? selection.slide.htmlContent ?? '' }
            : {}),
        startOffsetSeconds: selection.elapsedSeconds,
        durationSeconds: selection.card.durationSeconds,
        backgroundMusic: slideBackgroundMusic(
            selection.slide,
            enableBackgroundMusic(backgroundMusic),
        ),
    };
}

function shouldRenderSlideInIframe(slide: SlideAsset) {
    return Boolean(slide.templateId) || isYouTubeSlide(slide);
}

function slideBackgroundMusic(slide: SlideAsset, music: BackgroundMusic) {
    return isYouTubeSlide(slide) ? null : music;
}

async function fallbackCarouselAssetState(
    asset: MediaAsset,
    selection: NonNullable<ReturnType<typeof selectFallbackCarouselSlide>>,
    reason: string,
    base: ChannelStateBase,
    mediaAccessToken = '',
) {
    const common = {
        ...base,
        signature: `fallback-carousel:${asset.id}:${selection.index}:${asset.updatedAt}:${selection.carouselUpdatedAt}`,
        reason,
        blockId: null,
        assetId: asset.id,
        title: asset.title,
        startOffsetSeconds: selection.elapsedSeconds,
        durationSeconds: selection.card.durationSeconds,
        muted: false,
        loop: false,
        ...videoPresentation(asset),
        backgroundMusic: null,
    };

    if (asset.playbackKind === 'video_file' && asset.url) {
        return {
            ...common,
            kind: 'mp4' as const,
            url: withMediaAccessToken(asset.url, mediaAccessToken),
        };
    }

    if (asset.playbackKind === 'hls' && asset.url) {
        return {
            ...common,
            kind: 'hls' as const,
            hlsUrl: withMediaAccessToken(asset.url, mediaAccessToken),
        };
    }

    return null;
}

async function fallbackVideoState(
    asset: MediaAsset,
    reason: string,
    base: ChannelStateBase,
    mediaAccessToken = '',
) {
    const common = {
        ...base,
        signature: `fallback-loop:${asset.id}:${asset.updatedAt}`,
        reason,
        assetId: asset.id,
        title: asset.title,
        startOffsetSeconds: loopOffset(base.serverSeconds, asset.durationSeconds),
        durationSeconds: asset.durationSeconds ?? null,
        muted: true,
        loop: true,
        ...videoPresentation(asset),
        backgroundMusic: null,
    };

    if (asset.playbackKind === 'video_file' && asset.url) {
        return { ...common, kind: 'mp4', url: withMediaAccessToken(asset.url, mediaAccessToken) };
    }

    if (asset.playbackKind === 'hls' && asset.url) {
        return {
            ...common,
            kind: 'hls',
            hlsUrl: withMediaAccessToken(asset.url, mediaAccessToken),
        };
    }

    return null;
}

function findFallbackLoopAsset(bundle: ScheduleBundle) {
    return findPlayableFallback(bundle.mediaAssets);
}

function loopOffset(serverSeconds: number, durationSeconds?: number | null) {
    if (!durationSeconds || durationSeconds <= 1) {
        return 0;
    }

    return Math.max(0, Math.floor(serverSeconds % durationSeconds));
}

export function fallbackState(
    reason: string,
    base?: ChannelStateBase,
    backgroundMusic: BackgroundMusic = null,
) {
    return {
        kind: 'fallback' as const,
        signature: `fallback:${reason}`,
        reason,
        title: 'Broadcast Planner fallback',
        serverSeconds: base?.serverSeconds ?? secondsSinceMidnightInTimezone(),
        generatedAt: base?.generatedAt ?? new Date().toISOString(),
        backgroundMusic,
    };
}

function videoPresentation(asset: MediaAsset) {
    const presentation = asset.metadata?.presentation === 'vertical_blur' ? 'vertical_blur' : 'fit';
    const background =
        presentation === 'vertical_blur' || asset.metadata?.background === 'blur'
            ? 'blur'
            : 'black';

    return { presentation, background };
}

function recordedBugPresentation(block: Parameters<typeof recordedBugFromBlock>[0]) {
    const recordedBug = recordedBugFromBlock(block);

    return recordedBug ? { recordedBug } : {};
}

function metadataText(metadata: Record<string, unknown> | null | undefined, key: string) {
    const value = metadata?.[key];

    return typeof value === 'string' ? value : '';
}

async function backgroundMusicForActive(
    bundle: ScheduleBundle,
    active: ActiveSchedule,
    mediaAccessToken = '',
) {
    const shouldPlay =
        active.block?.blockType === 'image' ||
        active.block?.blockType === 'slide' ||
        active.block?.blockType === 'fallback' ||
        !active.block ||
        Boolean(active.slide) ||
        active.asset?.mediaKind === 'image';
    const preference = await getLatestMusicPreference();

    if (!preference.enabled) {
        return null;
    }
    const tracks = bundle.mediaAssets
        .filter((asset) => asset.assetType === 'music' && asset.status === 'ready' && asset.url)
        .map((asset) => ({
            id: asset.id,
            title: asset.title,
            url: withMediaAccessToken(asset.url!, mediaAccessToken),
        }));

    if (!tracks.length) {
        return null;
    }

    return {
        enabled: shouldPlay,
        volume: preference.volume,
        fade: preference.fade,
        tracks,
    };
}

function suppressBackgroundMusic(music: BackgroundMusic): BackgroundMusic {
    return music ? { ...music, enabled: false } : null;
}

function enableBackgroundMusic(music: BackgroundMusic): BackgroundMusic {
    return music ? { ...music, enabled: true } : null;
}

function withMediaAccessToken(value: string, token: string) {
    if (!token || !value.includes('/api/media/assets/')) {
        return value;
    }

    try {
        const url = new URL(value);

        if (url.pathname.startsWith('/api/media/assets/')) {
            url.searchParams.set('token', token);

            return url.toString();
        }

        return value;
    } catch {
        if (!value.startsWith('/api/media/assets/')) {
            return value;
        }
        const url = new URL(value, 'https://local.invalid');
        url.searchParams.set('token', token);

        return `${url.pathname}${url.search}`;
    }
}

function previewActiveSchedule(
    bundle: ScheduleBundle,
    blockId: string,
    elapsedInBlock: number,
): ActiveSchedule {
    const block = bundle.blocks.find((candidate) => candidate.id === blockId) ?? null;

    if (!block) {
        return {
            day: bundle.day,
            block: null,
            elapsedInBlock: 0,
            layers: [],
            fallbackAsset:
                bundle.mediaAssets.find(
                    (asset) => asset.assetType === 'fallback' && asset.status === 'ready',
                ) ?? null,
            reason: 'Block not found',
        };
    }

    return {
        day: bundle.day,
        block,
        elapsedInBlock,
        layers: block.hideOverlays ? [] : findActiveLayers(bundle.layers, block.id, elapsedInBlock),
        asset: block.assetId
            ? (bundle.mediaAssets.find((asset) => asset.id === block.assetId) ?? null)
            : null,
        slide: block.slideId
            ? (bundle.slideAssets.find((slide) => slide.id === block.slideId) ?? null)
            : null,
        fallbackAsset: block.fallbackAssetId
            ? (bundle.mediaAssets.find((asset) => asset.id === block.fallbackAssetId) ?? null)
            : (bundle.mediaAssets.find(
                  (asset) => asset.assetType === 'fallback' && asset.status === 'ready',
              ) ?? null),
    };
}
