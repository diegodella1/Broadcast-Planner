import { cache } from 'react';

import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';

import { mapAuditEvent, type AuditEvent } from './audit/audit';
import { getDb } from './db/client';
import {
    auditLog,
    guests,
    mediaAssets,
    operatorRunbookChecks,
    programBlocks,
    programDays,
    scheduledLayers,
    slideAssets,
    type AuditLogRow,
    type GuestRow,
    type MediaAssetRow,
    type OperatorRunbookCheckRow,
    type ProgramBlockRow,
    type ProgramDayRow,
    type ScheduledLayerRow,
    type SlideAssetRow,
} from './db/schema';
import { isoDateInTimezone, PLAYOUT_TIMEZONE } from './helpers/time';
import { mockSchedule } from './mock-data';

import type { DrizzleD1Client } from './db/client';
import type {
    Guest,
    MediaAsset,
    ProgramBlock,
    ProgramDay,
    RunbookCheckState,
    ScheduleBundle,
    ScheduledLayer,
    SlideAsset,
} from './types';

export function shouldUseDemoData() {
    if (isProductionLikeRuntime() && process.env.ALLOW_DEMO_DATA === 'true') {
        throw new Error('ALLOW_DEMO_DATA cannot be enabled in production');
    }

    return process.env.ALLOW_DEMO_DATA === 'true';
}

export function handleDataFailure<T>(error: unknown, demoValue: T): T {
    if (shouldUseDemoData()) {
        return demoValue;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Database unavailable: ${message}`);
}

function isProductionLikeRuntime() {
    return (
        process.env.NODE_ENV === 'production' ||
        process.env.APP_BASE_URL?.startsWith('https://') ||
        process.env.NEXT_PUBLIC_APP_BASE_URL?.startsWith('https://')
    );
}

export const getScheduleForDate = cache(async (date: string): Promise<ScheduleBundle> => {
    try {
        const db = await getDb();
        const [dayRows, allMedia, allSlides] = await Promise.all([
            db.select().from(programDays).where(eq(programDays.airDate, date)).limit(1),
            db.select().from(mediaAssets).orderBy(asc(mediaAssets.title)),
            db.select().from(slideAssets).orderBy(asc(slideAssets.title)),
        ]);

        const day = dayRows[0] ?? null;

        if (!day) {
            return {
                day: null,
                blocks: [],
                layers: [],
                mediaAssets: allMedia.map((row) => mapMediaAsset(row)),
                slideAssets: allSlides.map(mapSlide),
            };
        }

        const blockRows = await db
            .select()
            .from(programBlocks)
            .where(eq(programBlocks.programDayId, day.id))
            .orderBy(asc(programBlocks.startTimeSeconds));

        const blockIds = blockRows.map((row) => row.id);
        const layerRows = blockIds.length
            ? await db
                  .select()
                  .from(scheduledLayers)
                  .where(inArray(scheduledLayers.programBlockId, blockIds))
            : [];

        return {
            day: mapDay(day),
            blocks: blockRows.map(mapBlock),
            layers: layerRows.map(mapLayer),
            mediaAssets: allMedia.map((row) => mapMediaAsset(row)),
            slideAssets: allSlides.map(mapSlide),
        };
    } catch (error) {
        return handleDataFailure(error, mockSchedule);
    }
});

export async function getSchedulesForDateRange(
    startDate: string,
    endDate: string,
): Promise<Map<string, ScheduleBundle>> {
    try {
        const db = await getDb();
        const [dayRows, allMedia, allSlides] = await Promise.all([
            db
                .select()
                .from(programDays)
                .where(and(gte(programDays.airDate, startDate), lte(programDays.airDate, endDate))),
            db.select().from(mediaAssets).orderBy(asc(mediaAssets.title)),
            db.select().from(slideAssets).orderBy(asc(slideAssets.title)),
        ]);

        if (!dayRows.length) {
            return new Map();
        }

        const { blockRows, layerRows } = await fetchBlocksAndLayersForDays(db, dayRows);
        const mappedMediaAssets = allMedia.map((row) => mapMediaAsset(row));
        const mappedSlideAssets = allSlides.map(mapSlide);

        return assembleSchedulesByDate({
            dayRows,
            blockRows,
            layerRows,
            mediaAssets: mappedMediaAssets,
            slideAssets: mappedSlideAssets,
        });
    } catch (error) {
        return handleDataFailure(error, new Map<string, ScheduleBundle>());
    }
}

async function fetchBlocksAndLayersForDays(
    db: DrizzleD1Client,
    dayRows: ProgramDayRow[],
): Promise<{ blockRows: ProgramBlockRow[]; layerRows: ScheduledLayerRow[] }> {
    const dayIds = dayRows.map((row) => row.id);
    const blockRows = await db
        .select()
        .from(programBlocks)
        .where(inArray(programBlocks.programDayId, dayIds))
        .orderBy(asc(programBlocks.startTimeSeconds));

    const blockIds = blockRows.map((row) => row.id);
    const layerRows = blockIds.length
        ? await db
              .select()
              .from(scheduledLayers)
              .where(inArray(scheduledLayers.programBlockId, blockIds))
        : [];

    return { blockRows, layerRows };
}

function assembleSchedulesByDate(input: {
    dayRows: ProgramDayRow[];
    blockRows: ProgramBlockRow[];
    layerRows: ScheduledLayerRow[];
    mediaAssets: MediaAsset[];
    slideAssets: SlideAsset[];
}): Map<string, ScheduleBundle> {
    const blocksByDayId = groupBy(input.blockRows, (row) => row.programDayId);
    const layersByBlockId = groupBy(input.layerRows, (row) => row.programBlockId);
    const result = new Map<string, ScheduleBundle>();

    for (const dayRow of input.dayRows) {
        const dayBlocks = blocksByDayId.get(dayRow.id) ?? [];
        const dayLayers = dayBlocks.flatMap((block) => layersByBlockId.get(block.id) ?? []);
        result.set(dayRow.airDate, {
            day: mapDay(dayRow),
            blocks: dayBlocks.map(mapBlock),
            layers: dayLayers.map(mapLayer),
            mediaAssets: input.mediaAssets,
            slideAssets: input.slideAssets,
        });
    }

    return result;
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
    const result = new Map<string, T[]>();

    for (const row of rows) {
        const key = keyFn(row);
        const list = result.get(key);

        if (list) {
            list.push(row);
        } else {
            result.set(key, [row]);
        }
    }

    return result;
}

export async function getProgrammedSecondsByDate(days: Pick<ProgramDay, 'id' | 'airDate'>[]) {
    if (!days.length) {
        return new Map<string, number>();
    }

    try {
        const db = await getDb();
        const dayIdToDate = new Map(days.map((day) => [day.id, day.airDate]));
        const rows = await db
            .select({
                programDayId: programBlocks.programDayId,
                durationSeconds: programBlocks.durationSeconds,
                status: programBlocks.status,
            })
            .from(programBlocks)
            .where(
                inArray(
                    programBlocks.programDayId,
                    days.map((day) => day.id),
                ),
            );

        const totals = new Map<string, number>();

        for (const row of rows) {
            if (row.status === 'archived') {
                continue;
            }
            const date = dayIdToDate.get(row.programDayId);

            if (!date) {
                continue;
            }
            totals.set(date, (totals.get(date) ?? 0) + row.durationSeconds);
        }

        return totals;
    } catch (error) {
        return handleDataFailure(error, new Map<string, number>());
    }
}

export const getPlaybackScheduleForDate = cache(async (date: string): Promise<ScheduleBundle> => {
    try {
        const db = await getDb();
        const dayRows = await db
            .select()
            .from(programDays)
            .where(eq(programDays.airDate, date))
            .limit(1);
        const day = dayRows[0] ?? null;

        if (!day) {
            const fallbackMedia = await db
                .select()
                .from(mediaAssets)
                .where(and(eq(mediaAssets.assetType, 'fallback'), eq(mediaAssets.status, 'ready')));

            return {
                day: null,
                blocks: [],
                layers: [],
                mediaAssets: fallbackMedia.map((row) => mapMediaAsset(row)),
                slideAssets: [],
            };
        }

        const blockRows = await db
            .select()
            .from(programBlocks)
            .where(eq(programBlocks.programDayId, day.id))
            .orderBy(asc(programBlocks.startTimeSeconds));

        const blockIds = blockRows.map((row) => row.id);
        const layerRows = blockIds.length
            ? await db
                  .select()
                  .from(scheduledLayers)
                  .where(inArray(scheduledLayers.programBlockId, blockIds))
            : [];

        const mediaIds = uniqueIds([
            day.fallbackAssetId,
            ...blockRows.map((row) => row.assetId),
            ...blockRows.map((row) => row.fallbackAssetId),
            ...layerRows.map((row) => row.assetId),
        ]);
        const slideIds = uniqueIds([
            ...blockRows.map((row) => row.slideId),
            ...layerRows.map((row) => row.slideId),
        ]);

        const [referencedMedia, fallbackMedia, musicMedia, referencedSlides] = await Promise.all([
            mediaIds.length
                ? db.select().from(mediaAssets).where(inArray(mediaAssets.id, mediaIds))
                : Promise.resolve([] as MediaAssetRow[]),
            db
                .select()
                .from(mediaAssets)
                .where(and(eq(mediaAssets.assetType, 'fallback'), eq(mediaAssets.status, 'ready'))),
            db
                .select()
                .from(mediaAssets)
                .where(and(eq(mediaAssets.assetType, 'music'), eq(mediaAssets.status, 'ready'))),
            slideIds.length
                ? db.select().from(slideAssets).where(inArray(slideAssets.id, slideIds))
                : Promise.resolve([] as SlideAssetRow[]),
        ]);

        return {
            day: mapDay(day),
            blocks: blockRows.map(mapBlock),
            layers: layerRows.map(mapLayer),
            mediaAssets: uniqueMediaRows([...referencedMedia, ...fallbackMedia, ...musicMedia]).map(
                (row) => mapMediaAsset(row),
            ),
            slideAssets: referencedSlides.map(mapSlide),
        };
    } catch (error) {
        return handleDataFailure(error, mockSchedule);
    }
});

export async function getPlaybackScheduleForBlock(blockId: string): Promise<ScheduleBundle> {
    try {
        const db = await getDb();
        const rows = await db
            .select({ airDate: programDays.airDate })
            .from(programBlocks)
            .innerJoin(programDays, eq(programBlocks.programDayId, programDays.id))
            .where(eq(programBlocks.id, blockId))
            .limit(1);

        const date = rows[0]?.airDate ?? '';

        if (!date) {
            throw new Error('Block has no program day');
        }

        return getPlaybackScheduleForDate(date);
    } catch (error) {
        return handleDataFailure(error, mockSchedule);
    }
}

export async function getLiveSchedule(now = new Date(), timezone = PLAYOUT_TIMEZONE) {
    return getScheduleForDate(isoDateInTimezone(now, timezone));
}

export async function getLivePlaybackSchedule(now = new Date(), timezone = PLAYOUT_TIMEZONE) {
    return getPlaybackScheduleForDate(isoDateInTimezone(now, timezone));
}

export const getAssets = cache(async (): Promise<MediaAsset[]> => {
    try {
        const db = await getDb();
        const [rows, usedAssetIds] = await Promise.all([
            db.select().from(mediaAssets).orderBy(desc(mediaAssets.updatedAt)),
            getScheduledAssetIds(),
        ]);

        return rows.map((row) => mapMediaAsset(row, usedAssetIds));
    } catch (error) {
        return handleDataFailure(error, mockSchedule.mediaAssets);
    }
});

export type MediaAssetSummary = Pick<
    MediaAsset,
    'id' | 'title' | 'status' | 'assetType' | 'mediaKind' | 'durationSeconds' | 'createdAt'
>;

export const getAssetSummaries = cache(async (): Promise<MediaAssetSummary[]> => {
    try {
        const db = await getDb();
        const rows = await db
            .select({
                id: mediaAssets.id,
                title: mediaAssets.title,
                status: mediaAssets.status,
                assetType: mediaAssets.assetType,
                mediaKind: mediaAssets.mediaKind,
                durationSeconds: mediaAssets.durationSeconds,
                createdAt: mediaAssets.createdAt,
            })
            .from(mediaAssets)
            .orderBy(desc(mediaAssets.updatedAt));

        return rows.map(mapMediaAssetSummary);
    } catch (error) {
        return handleDataFailure(
            error,
            mockSchedule.mediaAssets.map((asset) => ({
                id: asset.id,
                title: asset.title,
                status: asset.status,
                assetType: asset.assetType,
                mediaKind: asset.mediaKind,
                durationSeconds: asset.durationSeconds ?? null,
                createdAt: asset.createdAt,
            })),
        );
    }
});

export const getRunbookState = cache(async (programDayId: string): Promise<RunbookCheckState[]> => {
    try {
        const db = await getDb();
        const rows = await db
            .select()
            .from(operatorRunbookChecks)
            .where(eq(operatorRunbookChecks.programDayId, programDayId))
            .orderBy(asc(operatorRunbookChecks.section), asc(operatorRunbookChecks.itemKey));

        return rows.map(mapRunbookCheck);
    } catch (error) {
        if (isMissingRunbookTable(error)) {
            return [];
        }

        return handleDataFailure(error, []);
    }
});

async function getScheduledAssetIds() {
    const db = await getDb();
    const [blockRows, layerRows] = await Promise.all([
        db
            .select({
                assetId: programBlocks.assetId,
                fallbackAssetId: programBlocks.fallbackAssetId,
                status: programBlocks.status,
            })
            .from(programBlocks),
        db
            .select({ assetId: scheduledLayers.assetId, enabled: scheduledLayers.enabled })
            .from(scheduledLayers),
    ]);

    const ids = [
        ...blockRows
            .filter((row) => row.status !== 'archived')
            .flatMap((row) => [row.assetId, row.fallbackAssetId]),
        ...layerRows.filter((row) => row.enabled !== false).map((row) => row.assetId),
    ];

    return new Set(ids.filter((id): id is string => Boolean(id)));
}

export const getMediaAssetById = cache(async (id: string): Promise<MediaAsset | null> => {
    try {
        const db = await getDb();
        const rows = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
        const row = rows[0] ?? null;

        return row ? mapMediaAsset(row) : null;
    } catch (error) {
        const fallback = mockSchedule.mediaAssets.find((asset) => asset.id === id) ?? null;

        return handleDataFailure(error, fallback);
    }
});

export const getMediaAssetByVimeoUri = cache(
    async (vimeoUri: string): Promise<MediaAsset | null> => {
        try {
            const db = await getDb();
            const rows = await db
                .select()
                .from(mediaAssets)
                .where(eq(mediaAssets.vimeoUri, vimeoUri))
                .limit(1);
            const row = rows[0] ?? null;

            return row ? mapMediaAsset(row) : null;
        } catch (error) {
            const fallback =
                mockSchedule.mediaAssets.find((asset) => asset.vimeoUri === vimeoUri) ?? null;

            return handleDataFailure(error, fallback);
        }
    },
);

export const getSlides = cache(async (): Promise<SlideAsset[]> => {
    try {
        const db = await getDb();
        const rows = await db.select().from(slideAssets).orderBy(desc(slideAssets.updatedAt));

        return rows.map(mapSlide);
    } catch (error) {
        return handleDataFailure(error, mockSchedule.slideAssets);
    }
});

export async function getGuests(input: { readyOnly?: boolean } = {}): Promise<Guest[]> {
    try {
        const db = await getDb();

        // Alias the mediaAssets table for the two FK joins.
        const photoAsset = mediaAssets;

        // D1/SQLite does not support two aliases of the same table in the same
        // query without raw SQL. Fetch guest rows first, then resolve asset URLs
        // with a single IN query on unique asset IDs.
        const guestRows = await (input.readyOnly
            ? db
                  .select()
                  .from(guests)
                  .where(eq(guests.status, 'ready'))
                  .orderBy(asc(guests.appearanceAt), asc(guests.sortOrder), asc(guests.name))
            : db
                  .select()
                  .from(guests)
                  .orderBy(asc(guests.appearanceAt), asc(guests.sortOrder), asc(guests.name)));

        // Collect all referenced asset IDs for URL lookup.
        const assetIds = uniqueIds([
            ...guestRows.map((g) => g.photoAssetId),
            ...guestRows.map((g) => g.videoAssetId),
        ]);

        const assetUrlMap = new Map<string, string>();

        if (assetIds.length) {
            const assetRows = await db
                .select({ id: photoAsset.id, url: photoAsset.url })
                .from(photoAsset)
                .where(inArray(photoAsset.id, assetIds));

            for (const a of assetRows) {
                if (a.url) {
                    assetUrlMap.set(a.id, a.url);
                }
            }
        }

        return guestRows.map((row) => mapGuest(row, assetUrlMap));
    } catch (error) {
        return handleDataFailure(error, []);
    }
}

export const getDays = cache(async (): Promise<ProgramDay[]> => {
    try {
        const db = await getDb();
        const rows = await db.select().from(programDays).orderBy(desc(programDays.airDate));

        return rows.map(mapDay);
    } catch (error) {
        return handleDataFailure(error, mockSchedule.day ? [mockSchedule.day] : []);
    }
});

export async function getAuditEvents(
    input: {
        action?: string;
        entityType?: string;
        limit?: number;
    } = {},
): Promise<AuditEvent[]> {
    try {
        const db = await getDb();
        const limit = Math.min(Math.max(input.limit ?? 100, 1), 250);

        const conditions = [];

        if (input.action) {
            conditions.push(eq(auditLog.action, input.action));
        }

        if (input.entityType) {
            conditions.push(eq(auditLog.entityType, input.entityType));
        }

        const rows = await db
            .select()
            .from(auditLog)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(auditLog.createdAt))
            .limit(limit);

        // mapAuditEvent expects snake_case keys (entity_type, entity_id,
        // created_at). Drizzle returns camelCase, so we re-shape the row.
        return rows.map((row) => mapAuditEventFromDrizzle(row));
    } catch (error) {
        return handleDataFailure(error, []);
    }
}

/**
 * Adapts a Drizzle AuditLogRow (camelCase) to the snake_case shape that
 * mapAuditEvent() in audit.ts expects, without touching audit.ts.
 */
function mapAuditEventFromDrizzle(row: AuditLogRow): AuditEvent {
    return mapAuditEvent({
        id: row.id,
        actor: row.actor,
        action: row.action,
        entity_type: row.entityType,
        entity_id: row.entityId,
        metadata: row.metadata,
        created_at: row.createdAt,
    });
}

function mapDay(row: ProgramDayRow): ProgramDay {
    return {
        id: row.id,
        airDate: row.airDate,
        timezone: row.timezone,
        status: row.status as ProgramDay['status'],
        title: row.title ?? null,
        notes: row.notes ?? null,
        fallbackAssetId: row.fallbackAssetId ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function mapBlock(row: ProgramBlockRow): ProgramBlock {
    return {
        id: row.id,
        programDayId: row.programDayId,
        title: row.title,
        blockType: row.blockType as ProgramBlock['blockType'],
        category: (row.category ?? 'mercados') as ProgramBlock['category'],
        assetId: row.assetId ?? null,
        slideId: row.slideId ?? null,
        startTime: row.startTime,
        startTimeSeconds: row.startTimeSeconds,
        durationSeconds: row.durationSeconds,
        status: row.status as ProgramBlock['status'],
        hideOverlays: Boolean(row.hideOverlays),
        fallbackAssetId: row.fallbackAssetId ?? null,
        notes: row.notes ?? null,
        metadata:
            typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : {},
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function mapLayer(row: ScheduledLayerRow): ScheduledLayer {
    return {
        id: row.id,
        programBlockId: row.programBlockId,
        title: row.title,
        layerType: row.layerType as ScheduledLayer['layerType'],
        assetId: row.assetId ?? null,
        slideId: row.slideId ?? null,
        startTimeSeconds: row.startTimeSeconds,
        durationSeconds: row.durationSeconds,
        zIndex: row.zIndex,
        position: row.position as ScheduledLayer['position'],
        enabled: Boolean(row.enabled),
        locked: Boolean(row.locked),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function mapRunbookCheck(row: OperatorRunbookCheckRow): RunbookCheckState {
    return {
        id: row.id,
        programDayId: row.programDayId,
        section: row.section as RunbookCheckState['section'],
        itemKey: row.itemKey,
        checked: Boolean(row.checked),
        notes: row.notes ?? null,
        checkedAt: row.checkedAt ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function isMissingRunbookTable(error: unknown) {
    // Postgres/PostgREST-specific codes; retained for forward-compat but will
    // not match D1/SQLite errors. The table always exists after migration.
    if (!error || typeof error !== 'object') {
        return false;
    }
    const row = error as Record<string, unknown>;
    const code = row.code === null || row.code === undefined ? null : String(row.code);
    const message = row.message === null || row.message === undefined ? '' : String(row.message);

    return (
        code === '42P01' ||
        code === 'PGRST205' ||
        message.includes('operator_runbook_checks') ||
        message.includes('Could not find the table')
    );
}

type MediaAssetSummaryRow = Pick<
    MediaAssetRow,
    'id' | 'title' | 'status' | 'assetType' | 'mediaKind' | 'durationSeconds' | 'createdAt'
>;

function mapMediaAssetSummary(row: MediaAssetSummaryRow): MediaAssetSummary {
    return {
        id: row.id,
        title: row.title,
        status: row.status as MediaAsset['status'],
        assetType: row.assetType as MediaAsset['assetType'],
        mediaKind: row.mediaKind as MediaAsset['mediaKind'],
        durationSeconds: row.durationSeconds ?? null,
        createdAt: row.createdAt,
    };
}

function mapMediaAsset(row: MediaAssetRow, scheduledAssetIds = new Set<string>()): MediaAsset {
    return {
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        sourceType: row.sourceType as MediaAsset['sourceType'],
        mediaKind: row.mediaKind as MediaAsset['mediaKind'],
        assetType: row.assetType as MediaAsset['assetType'],
        url: row.url ?? null,
        storageBucket: row.storageBucket ?? null,
        storagePath: row.storagePath ?? null,
        thumbnailUrl: row.thumbnailUrl ?? null,
        durationSeconds: row.durationSeconds ?? null,
        status: row.status as MediaAsset['status'],
        lifecycleState: (scheduledAssetIds.has(row.id)
            ? 'scheduled_in_use'
            : (row.lifecycleState ?? 'reviewed')) as NonNullable<MediaAsset['lifecycleState']>,
        vimeoId: row.vimeoId ?? null,
        vimeoUri: row.vimeoUri ?? null,
        vimeoPrivacy: row.vimeoPrivacy ?? null,
        vimeoEmbedStatus: row.vimeoEmbedStatus ?? null,
        playbackReadinessStatus: (row.playbackReadinessStatus ?? 'unchecked') as NonNullable<
            MediaAsset['playbackReadinessStatus']
        >,
        playbackCheckedAt: row.playbackCheckedAt ?? null,
        playbackError: row.playbackError ?? null,
        metadata:
            typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function mapSlide(row: SlideAssetRow): SlideAsset {
    return {
        id: row.id,
        title: row.title,
        slideType: row.slideType as SlideAsset['slideType'],
        content: row.content ?? null,
        imageUrl: row.imageUrl ?? null,
        htmlContent: row.htmlContent ?? null,
        templateId: row.templateId ?? null,
        defaultDurationSeconds: row.defaultDurationSeconds ?? null,
        status: row.status as SlideAsset['status'],
        metadata:
            typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function mapGuest(row: GuestRow, assetUrlMap: Map<string, string>): Guest {
    const photoUrl =
        (row.photoAssetId ? (assetUrlMap.get(row.photoAssetId) ?? null) : null) ??
        row.photoUrl ??
        null;
    const videoUrl =
        (row.videoAssetId ? (assetUrlMap.get(row.videoAssetId) ?? null) : null) ??
        row.videoUrl ??
        null;

    return {
        id: row.id,
        name: row.name,
        role: row.role ?? null,
        company: row.company ?? null,
        host: row.host ?? null,
        program: row.program ?? null,
        category: row.category ?? 'markets',
        appearanceAt: row.appearanceAt ?? null,
        photoUrl,
        photoAssetId: row.photoAssetId ?? null,
        videoUrl,
        videoAssetId: row.videoAssetId ?? null,
        color: row.color ?? '#f7931a',
        sortOrder: row.sortOrder,
        status: row.status as Guest['status'],
        metadata:
            typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
    return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function uniqueMediaRows(rows: MediaAssetRow[]): MediaAssetRow[] {
    return [...new Map(rows.map((row) => [row.id, row])).values()];
}
