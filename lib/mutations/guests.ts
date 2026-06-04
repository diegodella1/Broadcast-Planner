import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { auditedMutation } from '../audit/audit';
import { getDb } from '../db/client';
import { guests, slideAssets } from '../db/schema';
import { err, extractError, ok, type Result } from '../result';

import { createSlideAsset } from './assets';

import type { GuestStatus } from '../types';

function normalizeGuestStatus(status?: GuestStatus): GuestStatus {
    if (status === 'draft' || status === 'archived') {
        return status;
    }

    return 'ready';
}

function normalizeGuestIds(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

type GuestRowInput = {
    name: string;
    role?: string | undefined;
    company?: string | undefined;
    host?: string | undefined;
    program?: string | undefined;
    category?: string | undefined;
    appearanceAt?: string | undefined;
    photoUrl?: string | undefined;
    photoAssetId?: string | undefined;
    videoUrl?: string | undefined;
    videoAssetId?: string | undefined;
    color?: string | undefined;
    sortOrder?: number | undefined;
    status?: GuestStatus | undefined;
};

function buildGuestRow(input: GuestRowInput) {
    return {
        name: input.name,
        role: input.role || null,
        company: input.company || null,
        host: input.host || null,
        program: input.program || null,
        category: input.category || 'markets',
        appearanceAt: input.appearanceAt || null,
        photoUrl: input.photoUrl || null,
        photoAssetId: input.photoAssetId || null,
        videoUrl: input.videoUrl || null,
        videoAssetId: input.videoAssetId || null,
        color: input.color || '#f7931a',
        sortOrder: input.sortOrder ?? 0,
        status: normalizeGuestStatus(input.status),
    };
}

export async function createGuest(input: GuestRowInput): Promise<Result<void>> {
    try {
        const db = await getDb();
        const row = buildGuestRow(input);

        await auditedMutation(
            {
                action: 'guest.created',
                entityType: 'guests',
                next: { name: row.name, status: row.status },
            },
            async () => {
                await db.insert(guests).values(row);
            },
        );
        revalidatePath('/admin/guests');
        revalidatePath('/admin/slides');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function updateGuest(input: GuestRowInput & { id: string }): Promise<Result<void>> {
    try {
        const db = await getDb();
        const row = { ...buildGuestRow(input), updatedAt: new Date().toISOString() };

        await auditedMutation(
            {
                action: 'guest.updated',
                entityType: 'guests',
                entityId: input.id,
                next: { name: row.name, status: row.status },
            },
            async () => {
                await db.update(guests).set(row).where(eq(guests.id, input.id));
            },
        );
        revalidatePath('/admin/guests');
        revalidatePath('/admin/slides');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function archiveGuest(id: string): Promise<Result<void>> {
    try {
        const db = await getDb();

        await auditedMutation(
            {
                action: 'guest.archived',
                entityType: 'guests',
                entityId: id,
                next: { status: 'archived' },
            },
            async () => {
                await db
                    .update(guests)
                    .set({ status: 'archived', updatedAt: new Date().toISOString() })
                    .where(eq(guests.id, id));
            },
        );
        revalidatePath('/admin/guests');
        revalidatePath('/admin/slides');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function attachGuestMediaAsset(input: {
    guestId: string;
    kind: 'photo' | 'video';
    assetId: string;
    url: string;
}): Promise<Result<void>> {
    try {
        const db = await getDb();

        await auditedMutation(
            {
                action: 'guest.media_attached',
                entityType: 'guests',
                entityId: input.guestId,
                next: { kind: input.kind, asset_id: input.assetId },
            },
            async () => {
                const update =
                    input.kind === 'photo'
                        ? {
                              photoAssetId: input.assetId,
                              photoUrl: input.url,
                              updatedAt: new Date().toISOString(),
                          }
                        : {
                              videoAssetId: input.assetId,
                              videoUrl: input.url,
                              updatedAt: new Date().toISOString(),
                          };

                await db.update(guests).set(update).where(eq(guests.id, input.guestId));
            },
        );
        revalidatePath('/admin/guests');
        revalidatePath('/admin/slides');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function createGuestPlate(input: {
    title: string;
    guestIds: string[];
    defaultDurationSeconds?: number | undefined;
    status?: string | undefined;
}): Promise<Result<void>> {
    try {
        const guestIds = normalizeGuestIds(input.guestIds);

        if (!guestIds.length) {
            return err('Selecciona al menos un invitado');
        }

        const result = await createSlideAsset({
            title: input.title,
            slideType: 'template',
            templateId: 'guest-lineup',
            content: 'Guest Lineup plate with custom guest selection.',
            defaultDurationSeconds: input.defaultDurationSeconds ?? 30,
            status: input.status || 'ready',
            metadata: { guestIds },
        });

        if (!result.success) {
            return result;
        }

        revalidatePath('/admin/guests');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function updateGuestPlate(input: {
    slideId: string;
    title: string;
    guestIds: string[];
    defaultDurationSeconds?: number | undefined;
    status?: string | undefined;
}): Promise<Result<void>> {
    try {
        const guestIds = normalizeGuestIds(input.guestIds);

        if (!guestIds.length) {
            return err('Selecciona al menos un invitado');
        }

        const status =
            input.status === 'draft' || input.status === 'archived' ? input.status : 'ready';
        const db = await getDb();

        await auditedMutation(
            {
                action: 'guest_plate.updated',
                entityType: 'slide_assets',
                entityId: input.slideId,
                next: { title: input.title, status, guests: guestIds.length },
            },
            async () => {
                await db
                    .update(slideAssets)
                    .set({
                        title: input.title,
                        defaultDurationSeconds: input.defaultDurationSeconds ?? 30,
                        status,
                        metadata: { guestIds },
                        updatedAt: new Date().toISOString(),
                    })
                    .where(
                        and(
                            eq(slideAssets.id, input.slideId),
                            eq(slideAssets.templateId, 'guest-lineup'),
                        ),
                    );
            },
        );
        revalidatePath('/admin/guests');
        revalidatePath('/admin/slides');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}

export async function archiveGuestPlate(slideId: string): Promise<Result<void>> {
    try {
        const db = await getDb();

        await auditedMutation(
            {
                action: 'guest_plate.archived',
                entityType: 'slide_assets',
                entityId: slideId,
                next: { status: 'archived' },
            },
            async () => {
                await db
                    .update(slideAssets)
                    .set({ status: 'archived', updatedAt: new Date().toISOString() })
                    .where(
                        and(
                            eq(slideAssets.id, slideId),
                            eq(slideAssets.templateId, 'guest-lineup'),
                        ),
                    );
            },
        );
        revalidatePath('/admin/guests');
        revalidatePath('/admin/slides');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}
