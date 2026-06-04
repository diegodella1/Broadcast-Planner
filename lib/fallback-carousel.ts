import { cache } from 'react';
import { eq } from 'drizzle-orm';

import { getDb } from './db/client';
import { integrationSettings } from './db/schema';

import type { MediaAsset, ScheduleBundle, SlideAsset } from './types';

export type FallbackCarouselCard = {
    kind: 'slide' | 'asset';
    id: string;
    slideId?: string | undefined;
    assetId?: string | undefined;
    durationSeconds: number;
};

export type FallbackCarouselSet = {
    id: string;
    name: string;
    cards: FallbackCarouselCard[];
    createdAt: string;
    updatedAt: string;
};

export type FallbackCarousel = {
    enabled: boolean;
    cards: FallbackCarouselCard[];
    activeSetId?: string | null;
    sets: FallbackCarouselSet[];
    updatedAt: string;
};

export type FallbackCarouselSelection = {
    kind: 'slide' | 'asset';
    slide?: SlideAsset | undefined;
    asset?: MediaAsset | undefined;
    card: FallbackCarouselCard;
    index: number;
    elapsedSeconds: number;
    totalDurationSeconds: number;
    carouselUpdatedAt: string;
};

export const getGlobalFallbackCarousel = cache(async (): Promise<FallbackCarousel | null> => {
    const db = await getDb();
    const [row] = await db
        .select({
            publicConfig: integrationSettings.publicConfig,
            updatedAt: integrationSettings.updatedAt,
        })
        .from(integrationSettings)
        .where(eq(integrationSettings.provider, 'fallback_carousel'))
        .limit(1);

    return parseFallbackCarousel(row?.publicConfig, row?.updatedAt);
});

export function selectFallbackCarouselSlide(
    carousel: FallbackCarousel | null,
    bundle: Pick<ScheduleBundle, 'mediaAssets' | 'slideAssets'>,
    serverSeconds: number,
): FallbackCarouselSelection | null {
    if (!carousel?.enabled || !carousel.cards.length) {
        return null;
    }
    const slideById = new Map(
        bundle.slideAssets
            .filter((slide) => slide.status === 'ready')
            .map((slide) => [slide.id, slide]),
    );
    const assetById = new Map(
        bundle.mediaAssets
            .filter((asset) => isPlayableFallbackCarouselAsset(asset))
            .map((asset) => [asset.id, asset]),
    );
    const cards = carousel.cards.filter((card) =>
        card.kind === 'asset' ? assetById.has(card.id) : slideById.has(card.id),
    );

    if (!cards.length) {
        return null;
    }
    const totalDurationSeconds = cards.reduce((total, card) => total + card.durationSeconds, 0);

    if (totalDurationSeconds <= 0) {
        return null;
    }

    const loopSecond = Math.max(0, Math.floor(serverSeconds)) % totalDurationSeconds;
    let cursor = 0;

    for (const [index, card] of cards.entries()) {
        const nextCursor = cursor + card.durationSeconds;

        if (loopSecond < nextCursor) {
            const slide = card.kind === 'slide' ? slideById.get(card.id) : undefined;
            const asset = card.kind === 'asset' ? assetById.get(card.id) : undefined;

            if (!slide && !asset) {
                return null;
            }

            return {
                kind: card.kind,
                ...(slide ? { slide } : {}),
                ...(asset ? { asset } : {}),
                card,
                index,
                elapsedSeconds: loopSecond - cursor,
                totalDurationSeconds,
                carouselUpdatedAt: carousel.updatedAt,
            };
        }
        cursor = nextCursor;
    }

    return null;
}

export function isPlayableFallbackCarouselAsset(asset: MediaAsset) {
    return (
        asset.status === 'ready' &&
        asset.mediaKind === 'video' &&
        (asset.assetType === 'promo' ||
            asset.assetType === 'ad' ||
            asset.assetType === 'fallback') &&
        Boolean(asset.url || asset.storagePath || asset.vimeoId)
    );
}

export function fallbackCarouselDisplayName(carousel: FallbackCarousel | null) {
    if (!carousel?.enabled) {
        return null;
    }

    return (
        carousel.sets.find((set) => set.id === carousel.activeSetId)?.name ??
        carousel.sets[0]?.name ??
        'Slide carousel'
    );
}

export function parseFallbackCarousel(
    value: unknown,
    updatedAt: unknown = null,
): FallbackCarousel | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const record = value as Record<string, unknown>;
    const rawCards = Array.isArray(record.cards) ? record.cards : [];
    const cards = rawCards
        .map((card) => parseFallbackCarouselCard(card))
        .filter((card): card is FallbackCarouselCard => Boolean(card));

    if (!cards.length) {
        return null;
    }

    return {
        enabled: record.enabled !== false,
        cards,
        activeSetId: typeof record.activeSetId === 'string' ? record.activeSetId : null,
        sets: parseFallbackCarouselSets(record.sets),
        updatedAt: typeof updatedAt === 'string' ? updatedAt : new Date(0).toISOString(),
    };
}

function parseFallbackCarouselSets(value: unknown): FallbackCarouselSet[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((set) => parseFallbackCarouselSet(set))
        .filter((set): set is FallbackCarouselSet => Boolean(set));
}

function parseFallbackCarouselSet(value: unknown): FallbackCarouselSet | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const record = value as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const cards = Array.isArray(record.cards)
        ? record.cards
              .map((card) => parseFallbackCarouselCard(card))
              .filter((card): card is FallbackCarouselCard => Boolean(card))
        : [];

    if (!id || !name || !cards.length) {
        return null;
    }

    return {
        id,
        name,
        cards,
        createdAt:
            typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString(),
        updatedAt:
            typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    };
}

function parseFallbackCarouselCard(value: unknown): FallbackCarouselCard | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const record = value as Record<string, unknown>;
    const durationSeconds = Math.max(1, Math.round(Number(record.durationSeconds || 0)));
    const explicitKind = record.kind === 'asset' || record.kind === 'slide' ? record.kind : null;
    const assetId = typeof record.assetId === 'string' ? record.assetId : '';
    const slideId = typeof record.slideId === 'string' ? record.slideId : '';
    const id = typeof record.id === 'string' ? record.id : assetId || slideId;
    const kind = explicitKind ?? (assetId ? 'asset' : 'slide');

    if (!id) {
        return null;
    }

    return {
        kind,
        id,
        ...(kind === 'asset' ? { assetId: id } : { slideId: id }),
        durationSeconds,
    };
}
