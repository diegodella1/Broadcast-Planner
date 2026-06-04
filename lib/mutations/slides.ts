import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { auditedMutation } from '../audit/audit';
import {
    parseFallbackCarousel,
    type FallbackCarouselCard,
    type FallbackCarouselSet,
} from '../fallback-carousel';
import { err, extractError, ok, type Result } from '../result';
import { getDb, type DrizzleD1Client } from '../db/client';
import {
    integrationSettings,
    operatorRunbookChecks,
    scheduledLayers,
    slideAssets,
} from '../db/schema';
import { parseTimecode } from '../helpers/time';
import { youtubeSlideMetadata } from '../slides/youtube';

import { createSlideAsset } from './assets';

import type { RunbookSection } from '../types';

type WeatherLocationInput = { locationName: string; lat: number; lon: number };

function normalizeWeatherLocation(input: WeatherLocationInput): Result<WeatherLocationInput> {
    const locationName = input.locationName.trim();
    const lat = Number(input.lat);
    const lon = Number(input.lon);

    if (!locationName) {
        return err('City name is required');
    }

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        return err('Latitude is invalid');
    }

    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        return err('Longitude is invalid');
    }

    return ok({ locationName, lat, lon });
}

function weatherPlateMetadata(location: WeatherLocationInput) {
    return {
        weatherLocationName: location.locationName,
        weatherLat: location.lat,
        weatherLon: location.lon,
    };
}

function normalizeWeatherStatus(status: string | undefined): 'draft' | 'archived' | 'ready' {
    if (status === 'draft' || status === 'archived') {
        return status;
    }

    return 'ready';
}

function normalizeFallbackCards(
    cards: Array<{
        id?: string | undefined;
        slideId?: string | undefined;
        assetId?: string | undefined;
        kind?: string | undefined;
        durationSeconds: number;
    }>,
): FallbackCarouselCard[] {
    return cards
        .map((card) => {
            const kind: FallbackCarouselCard['kind'] = card.kind === 'asset' ? 'asset' : 'slide';
            const id = String(
                kind === 'asset' ? card.assetId || card.id || '' : card.slideId || card.id || '',
            );

            const next: FallbackCarouselCard = {
                kind,
                id,
                ...(kind === 'asset' ? { assetId: id } : { slideId: id }),
                durationSeconds: Math.max(1, Math.round(Number(card.durationSeconds || 30))),
            };

            return next;
        })
        .filter((card): card is FallbackCarouselCard => Boolean(card.id));
}

export type RunbookCheckInput = {
    date: string;
    programDayId: string;
    section: RunbookSection;
    itemKey: string;
    checked: boolean;
    notes?: string | undefined;
};

export type FallbackCarouselInput = {
    cards: Array<{
        id?: string | undefined;
        slideId?: string | undefined;
        assetId?: string | undefined;
        kind?: string | undefined;
        durationSeconds: number;
    }>;
};

export type SaveFallbackCarouselSetInput = FallbackCarouselInput & {
    name: string;
    setId?: string | undefined;
};

export type WeatherPlateBaseInput = {
    title: string;
    locationName: string;
    lat: number;
    lon: number;
    defaultDurationSeconds?: number | undefined;
    status?: string | undefined;
};

export type YouTubeSlideInput = {
    title: string;
    url: string;
    zoom?: number | string | undefined;
    muted?: boolean | string | undefined;
    loop?: boolean | string | undefined;
    startSeconds?: number | string | undefined;
    defaultDurationSeconds?: number | undefined;
    status?: string | undefined;
};

export type ScheduledLayerInput = {
    date: string;
    blockId: string;
    title: string;
    layerType: string;
    assetId?: string | undefined;
    slideId?: string | undefined;
    startTime: string;
    durationSeconds: number;
    zIndex: number;
    position: string;
};

export type SetScheduledLayerEnabledInput = {
    date: string;
    blockId: string;
    layerId: string;
    enabled: boolean;
};

export async function updateRunbookCheck(input: RunbookCheckInput): Promise<Result<void>> {
    try {
        const db = await getDb();

        await auditedMutation(
            {
                action: 'operator_runbook.updated',
                entityType: 'operator_runbook_checks',
                metadata: { date: input.date, section: input.section, item_key: input.itemKey },
                next: { checked: input.checked, notes: input.notes || null },
            },
            async () => {
                await db
                    .insert(operatorRunbookChecks)
                    .values({
                        programDayId: input.programDayId,
                        section: input.section,
                        itemKey: input.itemKey,
                        checked: input.checked,
                        notes: input.notes || null,
                        checkedAt: input.checked ? new Date().toISOString() : null,
                        updatedAt: new Date().toISOString(),
                    })
                    .onConflictDoUpdate({
                        target: [
                            operatorRunbookChecks.programDayId,
                            operatorRunbookChecks.section,
                            operatorRunbookChecks.itemKey,
                        ],
                        set: {
                            checked: input.checked,
                            notes: input.notes || null,
                            checkedAt: input.checked ? new Date().toISOString() : null,
                            updatedAt: new Date().toISOString(),
                        },
                    });
            },
        );
        revalidatePath(`/admin/runbook/${input.date}`);
        revalidatePath(`/admin/schedule/${input.date}`);
        revalidatePath('/admin/output');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function saveGlobalFallbackCarouselFromSlides(
    input: FallbackCarouselInput,
): Promise<Result<void>> {
    return saveFallbackCarouselSet({
        name: 'Loop Builder fallback',
        cards: input.cards,
    });
}

export async function saveFallbackCarouselSet(
    input: SaveFallbackCarouselSetInput,
): Promise<Result<void>> {
    try {
        const db = await getDb();
        const name = input.name.trim();
        const cards = normalizeFallbackCards(input.cards);

        if (!name) {
            return err('Fallback name is required');
        }

        if (!cards.length) {
            return err('Selecciona al menos una card para fallback');
        }

        const existing = await readFallbackCarouselConfig(db);
        const now = new Date().toISOString();
        const setId = input.setId || crypto.randomUUID();
        const previousSet = existing.sets.find((set) => set.id === setId);
        const nextSet: FallbackCarouselSet = {
            id: setId,
            name,
            cards,
            createdAt: previousSet?.createdAt ?? now,
            updatedAt: now,
        };
        const sets = [nextSet, ...existing.sets.filter((set) => set.id !== setId)];

        await writeFallbackCarouselConfig(db, {
            activeSetId: setId,
            sets,
            cards,
            action: 'fallback_carousel.set_saved',
            next: { activeSetId: setId, name, cards: cards.length, sets: sets.length },
        });

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function activateFallbackCarouselSet(setId: string): Promise<Result<void>> {
    try {
        const db = await getDb();
        const existing = await readFallbackCarouselConfig(db);
        const set = existing.sets.find((item) => item.id === setId);

        if (!set) {
            return err('Fallback set not found');
        }

        await writeFallbackCarouselConfig(db, {
            activeSetId: set.id,
            sets: existing.sets,
            cards: set.cards,
            action: 'fallback_carousel.set_activated',
            next: { activeSetId: set.id, name: set.name, cards: set.cards.length },
        });

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function deleteFallbackCarouselSet(setId: string): Promise<Result<void>> {
    try {
        const db = await getDb();
        const existing = await readFallbackCarouselConfig(db);
        const sets = existing.sets.filter((set) => set.id !== setId);
        const activeSet =
            existing.activeSetId === setId
                ? (sets[0] ?? null)
                : (sets.find((set) => set.id === existing.activeSetId) ?? null);

        await writeFallbackCarouselConfig(db, {
            activeSetId: activeSet?.id ?? null,
            sets,
            cards: activeSet?.cards ?? [],
            enabled: Boolean(activeSet),
            action: 'fallback_carousel.set_deleted',
            next: {
                deletedSetId: setId,
                activeSetId: activeSet?.id ?? null,
                sets: sets.length,
            },
        });

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

async function readFallbackCarouselConfig(db: DrizzleD1Client) {
    const [row] = await db
        .select({
            publicConfig: integrationSettings.publicConfig,
            updatedAt: integrationSettings.updatedAt,
        })
        .from(integrationSettings)
        .where(eq(integrationSettings.provider, 'fallback_carousel'))
        .limit(1);

    const parsed = parseFallbackCarousel(row?.publicConfig, row?.updatedAt);

    return {
        activeSetId: parsed?.activeSetId ?? null,
        sets: parsed?.sets ?? [],
        cards: parsed?.cards ?? [],
    };
}

async function writeFallbackCarouselConfig(
    db: DrizzleD1Client,
    input: {
        activeSetId: string | null;
        sets: FallbackCarouselSet[];
        cards: FallbackCarouselCard[];
        action: string;
        next: Record<string, unknown>;
        enabled?: boolean | undefined;
    },
) {
    await auditedMutation(
        {
            action: input.action,
            entityType: 'integration_settings',
            entityId: 'fallback_carousel',
            next: input.next,
        },
        async () => {
            const publicConfig = {
                enabled: input.enabled ?? true,
                activeSetId: input.activeSetId,
                sets: input.sets,
                cards: input.cards,
            };

            await db
                .insert(integrationSettings)
                .values({
                    provider: 'fallback_carousel',
                    publicConfig,
                    status: input.enabled === false ? 'disabled' : 'connected',
                    updatedAt: new Date().toISOString(),
                })
                .onConflictDoUpdate({
                    target: integrationSettings.provider,
                    set: {
                        publicConfig,
                        status: input.enabled === false ? 'disabled' : 'connected',
                        updatedAt: new Date().toISOString(),
                    },
                });
        },
    );
    revalidatePath('/admin/slides');
    revalidatePath('/admin/schedule');
    revalidatePath('/admin/assets');
    revalidatePath('/admin/output');
}

export async function createWeatherPlate(input: WeatherPlateBaseInput): Promise<Result<void>> {
    try {
        const normalized = normalizeWeatherLocation(input);

        if (!normalized.success) {
            return normalized;
        }

        const result = await createSlideAsset({
            title: input.title,
            slideType: 'template',
            templateId: 'weather',
            content: `Weather plate for ${normalized.data.locationName}.`,
            defaultDurationSeconds: input.defaultDurationSeconds ?? 30,
            status: input.status || 'ready',
            metadata: weatherPlateMetadata(normalized.data),
        });

        if (!result.success) {
            return result;
        }

        revalidatePath('/admin/slides');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function updateWeatherPlate(
    input: WeatherPlateBaseInput & { slideId: string },
): Promise<Result<void>> {
    try {
        const normalized = normalizeWeatherLocation(input);

        if (!normalized.success) {
            return normalized;
        }

        const status = normalizeWeatherStatus(input.status);
        const db = await getDb();

        await auditedMutation(
            {
                action: 'weather_plate.updated',
                entityType: 'slide_assets',
                entityId: input.slideId,
                next: { title: input.title, status, locationName: normalized.data.locationName },
            },
            async () => {
                await db
                    .update(slideAssets)
                    .set({
                        title: input.title,
                        content: `Weather plate for ${normalized.data.locationName}.`,
                        defaultDurationSeconds: input.defaultDurationSeconds ?? 30,
                        status,
                        metadata: weatherPlateMetadata(normalized.data),
                        updatedAt: new Date().toISOString(),
                    })
                    .where(
                        and(
                            eq(slideAssets.id, input.slideId),
                            eq(slideAssets.templateId, 'weather'),
                        ),
                    );
            },
        );
        revalidatePath('/admin/slides');
        revalidatePath('/admin/schedule');
        revalidatePath('/admin/output');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function createYouTubeSlide(input: YouTubeSlideInput): Promise<Result<void>> {
    try {
        const title = input.title.trim();
        const metadata = youtubeSlideMetadata({
            url: input.url,
            zoom: input.zoom,
            muted: input.muted,
            loop: input.loop,
            startSeconds: input.startSeconds,
        });

        if (!title) {
            return err('Title is required');
        }

        if (!metadata) {
            return err('YouTube URL is invalid');
        }

        const result = await createSlideAsset({
            title,
            slideType: 'html',
            content: `YouTube video ${metadata.youtubeVideoId}`,
            defaultDurationSeconds: input.defaultDurationSeconds ?? 30,
            status: input.status || 'ready',
            metadata,
        });

        if (!result.success) {
            return result;
        }

        revalidatePath('/admin/slides');
        revalidatePath('/admin/schedule');
        revalidatePath('/admin/output');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function createScheduledLayer(input: ScheduledLayerInput): Promise<Result<void>> {
    try {
        const startTimeSeconds = parseTimecode(input.startTime);
        const db = await getDb();

        await auditedMutation(
            {
                action: 'scheduled_layer.created',
                entityType: 'scheduled_layers',
                metadata: { block_id: input.blockId },
                next: {
                    title: input.title,
                    start_time: input.startTime,
                    duration_seconds: input.durationSeconds,
                },
            },
            async () => {
                await db.insert(scheduledLayers).values({
                    programBlockId: input.blockId,
                    title: input.title,
                    layerType: input.layerType,
                    assetId: input.assetId || null,
                    slideId: input.slideId || null,
                    startTimeSeconds,
                    durationSeconds: input.durationSeconds,
                    zIndex: input.zIndex,
                    position: input.position,
                    enabled: true,
                });
            },
        );
        revalidatePath(`/admin/schedule/${input.date}/blocks/${input.blockId}`);
        revalidatePath(`/admin/schedule/${input.date}`);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function setScheduledLayerEnabled(
    input: SetScheduledLayerEnabledInput,
): Promise<Result<void>> {
    try {
        const db = await getDb();

        await auditedMutation(
            {
                action: input.enabled ? 'scheduled_layer.enabled' : 'scheduled_layer.disabled',
                entityType: 'scheduled_layers',
                entityId: input.layerId,
                metadata: { block_id: input.blockId },
                next: { enabled: input.enabled },
            },
            async () => {
                await db
                    .update(scheduledLayers)
                    .set({ enabled: input.enabled, updatedAt: new Date().toISOString() })
                    .where(eq(scheduledLayers.id, input.layerId));
            },
        );
        revalidatePath(`/admin/schedule/${input.date}`);
        revalidatePath(`/admin/schedule/${input.date}/blocks/${input.blockId}`);

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}
