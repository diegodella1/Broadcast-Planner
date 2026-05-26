import { previewInsertShift } from '@/lib/scheduling/schedule-planner';
import { formatPlayoutTimeLabel, formatTimecode } from '@/lib/helpers/time';
import type { BlockType, MediaAsset, ProgramBlock, ScheduleBundle, SlideAsset } from '@/lib/types';

export const DEFAULT_MANUAL_DURATION = 30;
export const DAY_SECONDS = 86400;
export const CALENDAR_SNAP_SECONDS = 300;

export type ContentOption = {
    value: string;
    title: string;
    kind: 'asset' | 'slide';
    blockType: BlockType;
    durationSeconds: number | null;
    meta: string;
    searchText: string;
    mediaKind?: MediaAsset['mediaKind'] | undefined;
    assetType?: MediaAsset['assetType'] | undefined;
    showName?: string | undefined;
    assetId?: string;
    slideId?: string;
};

export type DrawerMode = 'add' | 'edit';

export type InitialContentFilters = {
    query?: string | undefined;
    kind?: string | undefined;
    showName?: string | undefined;
};

export type TimelineZoom = 'overview' | 'work' | 'detail';
export type CalendarSelection = { startSeconds: number; durationSeconds: number } | null;

export function snapCalendarSeconds(seconds: number) {
    return Math.max(
        0,
        Math.min(
            DAY_SECONDS - CALENDAR_SNAP_SECONDS,
            Math.round(seconds / CALENDAR_SNAP_SECONDS) * CALENDAR_SNAP_SECONDS,
        ),
    );
}

export function normalizeCalendarSelection(startSeconds: number, endSeconds: number) {
    const start = Math.max(0, Math.min(startSeconds, endSeconds));
    const end = Math.min(DAY_SECONDS, Math.max(startSeconds, endSeconds));

    return {
        startSeconds: start,
        durationSeconds: Math.max(CALENDAR_SNAP_SECONDS, end - start),
    };
}

export function formatBlockRange(block: ProgramBlock) {
    return formatCalendarRange(block.startTimeSeconds, block.durationSeconds);
}

export function formatCalendarRange(startTimeSeconds: number, durationSeconds: number) {
    return `${formatPlayoutTimeLabel(startTimeSeconds)} → ${formatPlayoutTimeLabel(
        Math.min(DAY_SECONDS, startTimeSeconds + durationSeconds),
    )}`;
}

export function formatDurationLabel(seconds: number) {
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.round(seconds / 60);

    if (minutes < 60) {
        return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function compactDurationLabel(seconds: number) {
    if (seconds < 60) {
        return `${seconds}s`;
    }

    if (seconds < 3600) {
        return `${Math.round(seconds / 60)}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);

    return minutes ? `${hours}h${minutes}m` : `${hours}h`;
}

export function formatDurationInput(seconds: number) {
    if (seconds < 60) {
        return `${seconds}s`;
    }

    return formatTimecode(seconds);
}

export function formatScheduleDate(date: string, timezone?: string) {
    const day = new Date(`${date}T12:00:00`);

    return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: timezone,
    }).format(day);
}

export function typeLabel(type: BlockType) {
    switch (type) {
        case 'ad':
            return 'Ad';
        case 'promo':
            return 'Promo';
        case 'fallback':
            return 'Fallback';
        case 'image':
            return 'Image';
        case 'slide':
            return 'Slide';
        default:
            return 'Video';
    }
}

export function blockAssetLabel(schedule: ScheduleBundle, block: ProgramBlock) {
    const asset = block.assetId
        ? schedule.mediaAssets.find((item) => item.id === block.assetId)
        : null;
    const slide = block.slideId
        ? schedule.slideAssets.find((item) => item.id === block.slideId)
        : null;

    if (asset) {
        return asset.title;
    }

    if (slide) {
        return slide.title;
    }

    return 'No content';
}

export function buildContentOptions(schedule: ScheduleBundle): ContentOption[] {
    const assets = schedule.mediaAssets
        .filter((asset) => asset.status === 'ready' && asset.assetType !== 'music')
        .map(assetOption);
    const slides = schedule.slideAssets
        .filter((slide) => slide.status === 'ready')
        .map(slideOption);

    return [
        ...assets.sort((a, b) => a.title.localeCompare(b.title)),
        ...slides.sort((a, b) => a.title.localeCompare(b.title)),
    ];
}

function assetOption(asset: MediaAsset): ContentOption {
    const showName = metadataText(asset, 'vimeo_show_name');

    return {
        value: `asset:${asset.id}`,
        title: asset.title,
        kind: 'asset',
        blockType: normalizeBlockType(asset.assetType),
        durationSeconds: asset.durationSeconds ?? null,
        meta: [
            showName,
            asset.assetType,
            asset.sourceType,
            asset.durationSeconds ? formatTimecode(asset.durationSeconds) : null,
        ]
            .filter(Boolean)
            .join(' / '),
        searchText: [asset.title, asset.description, asset.sourceType, asset.mediaKind, showName]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        mediaKind: asset.mediaKind,
        assetType: asset.assetType,
        showName: showName || undefined,
        assetId: asset.id,
    };
}

function slideOption(slide: SlideAsset): ContentOption {
    return {
        value: `slide:${slide.id}`,
        title: slide.title,
        kind: 'slide',
        blockType: 'slide',
        durationSeconds: slide.defaultDurationSeconds ?? null,
        meta: `slide${slide.defaultDurationSeconds ? ` / ${formatTimecode(slide.defaultDurationSeconds)}` : ''}`,
        searchText: [slide.title, slide.slideType, 'slide'].join(' ').toLowerCase(),
        mediaKind: 'graphic',
        assetType: 'overlay',
        slideId: slide.id,
    };
}

export function contentKind(option: ContentOption | null | undefined) {
    if (!option) {
        return undefined;
    }

    if (option.kind === 'slide') {
        return 'slide';
    }

    if (option.assetType === 'fallback') {
        return 'fallback';
    }

    if (option.assetType === 'ad') {
        return 'ad';
    }

    if (option.assetType === 'promo') {
        return 'promo';
    }

    if (option.mediaKind === 'image' || option.assetType === 'image') {
        return 'image';
    }

    return 'video';
}

export function contentValueForBlock(block: ProgramBlock) {
    if (block.assetId) {
        return `asset:${block.assetId}`;
    }

    if (block.slideId) {
        return `slide:${block.slideId}`;
    }

    return '';
}

export function metadataText(asset: MediaAsset, key: string) {
    const value = asset.metadata?.[key];

    return typeof value === 'string' ? value : '';
}

export function metadataTextFromBlock(block: ProgramBlock | null, key: string) {
    const value = block?.metadata?.[key];

    return typeof value === 'string' ? value : '';
}

export function recordedBugPosition(metadata: Record<string, unknown> | null | undefined) {
    return recordedBugPositionValue(metadata?.previously_recorded_position);
}

export function recordedBugPositionValue(value: unknown) {
    return value === 'top_left' ||
        value === 'top_right' ||
        value === 'bottom_left' ||
        value === 'bottom_right'
        ? value
        : 'top_right';
}

export function normalizeBlockType(assetType: MediaAsset['assetType']): BlockType {
    if (assetType === 'music' || assetType === 'overlay') {
        return 'video';
    }

    return assetType;
}

export function uniqueSorted(values: Array<string | undefined>) {
    return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
        a.localeCompare(b),
    );
}

export function nextSuggestedStart(blocks: ProgramBlock[]) {
    const activeBlocks = blocks
        .filter((block) => block.status !== 'archived')
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    const last = activeBlocks[activeBlocks.length - 1];

    return formatTimecode(last ? last.startTimeSeconds + last.durationSeconds : 0);
}

export function parseTimeInput(value: string) {
    const [hours = '0', minutes = '0', seconds = '0'] = value.split(':');
    const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);

    if (!Number.isFinite(total)) {
        return 0;
    }

    return Math.max(0, Math.min(total, 86399));
}

export function parseHumanDuration(value: string) {
    const text = value.trim().toLowerCase();

    if (!text) {
        return DEFAULT_MANUAL_DURATION;
    }

    if (/^\d+:\d{1,2}(:\d{1,2})?$/.test(text)) {
        const parts = text.split(':').map((part) => Number(part));
        const [hours = 0, minutes = 0, seconds = 0] =
            parts.length === 2 ? [0, parts[0], parts[1]] : parts;
        const total = hours * 3600 + minutes * 60 + seconds;

        return Math.max(1, Math.floor(Number.isFinite(total) ? total : DEFAULT_MANUAL_DURATION));
    }
    const matches = [
        ...text.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|s|sec|secs)?/g),
    ];

    if (matches.length) {
        const total = matches.reduce((sum, match) => {
            const amount = Number(match[1]);
            const unit = match[2] ?? 's';

            if (!Number.isFinite(amount)) {
                return sum;
            }

            if (unit.startsWith('h')) {
                return sum + amount * 3600;
            }

            if (unit.startsWith('m')) {
                return sum + amount * 60;
            }

            return sum + amount;
        }, 0);

        if (total > 0) {
            return Math.max(1, Math.floor(total));
        }
    }
    const numeric = Number(text);

    return Math.max(1, Math.floor(Number.isFinite(numeric) ? numeric : DEFAULT_MANUAL_DURATION));
}

export type RundownItem =
    | {
          kind: 'block';
          block: ProgramBlock;
          startSeconds: number;
          endSeconds: number;
          durationSeconds: number;
      }
    | {
          kind: 'gap';
          startSeconds: number;
          endSeconds: number;
          durationSeconds: number;
      };

type ScheduleGap = {
    startTimeSeconds: number;
    durationSeconds: number;
};

export function buildRundownItems(blocks: ProgramBlock[], gaps: ScheduleGap[]): RundownItem[] {
    return [
        ...blocks.map((block) => ({
            kind: 'block' as const,
            block,
            startSeconds: block.startTimeSeconds,
            endSeconds: Math.min(DAY_SECONDS, block.startTimeSeconds + block.durationSeconds),
            durationSeconds: block.durationSeconds,
        })),
        ...gaps.map((gap) => ({
            kind: 'gap' as const,
            startSeconds: gap.startTimeSeconds,
            endSeconds: Math.min(DAY_SECONDS, gap.startTimeSeconds + gap.durationSeconds),
            durationSeconds: gap.durationSeconds,
        })),
    ].sort((a, b) => a.startSeconds - b.startSeconds || b.durationSeconds - a.durationSeconds);
}

export function safePreviewInsertShift(
    input: Parameters<typeof previewInsertShift>[0],
): ReturnType<typeof previewInsertShift> | null {
    try {
        return previewInsertShift(input);
    } catch {
        return null;
    }
}
