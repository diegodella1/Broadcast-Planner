import { revalidatePath } from 'next/cache';

import { auditedMutation } from '../audit/audit';
import { err, extractError, ok, type Result } from '../result';
import { createServiceClient } from '../supabase/server';

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
        appearance_at: input.appearanceAt || null,
        photo_url: input.photoUrl || null,
        photo_asset_id: input.photoAssetId || null,
        video_url: input.videoUrl || null,
        video_asset_id: input.videoAssetId || null,
        color: input.color || '#f7931a',
        sort_order: input.sortOrder ?? 0,
        status: normalizeGuestStatus(input.status),
    };
}

export async function createGuest(input: GuestRowInput): Promise<Result<void>> {
    try {
        const supabase = createServiceClient();
        const row = buildGuestRow(input);
        await auditedMutation(
            {
                action: 'guest.created',
                entityType: 'guests',
                next: { name: row.name, status: row.status },
            },
            async () => {
                const { error } = await supabase.from('guests').insert(row);

                if (error) {
                    throw error;
                }
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
        const supabase = createServiceClient();
        const row = { ...buildGuestRow(input), updated_at: new Date().toISOString() };
        await auditedMutation(
            {
                action: 'guest.updated',
                entityType: 'guests',
                entityId: input.id,
                next: { name: row.name, status: row.status },
            },
            async () => {
                const { error } = await supabase.from('guests').update(row).eq('id', input.id);

                if (error) {
                    throw error;
                }
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
        const supabase = createServiceClient();
        await auditedMutation(
            {
                action: 'guest.archived',
                entityType: 'guests',
                entityId: id,
                next: { status: 'archived' },
            },
            async () => {
                const { error } = await supabase
                    .from('guests')
                    .update({ status: 'archived', updated_at: new Date().toISOString() })
                    .eq('id', id);

                if (error) {
                    throw error;
                }
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
        const supabase = createServiceClient();
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
                              photo_asset_id: input.assetId,
                              photo_url: input.url,
                              updated_at: new Date().toISOString(),
                          }
                        : {
                              video_asset_id: input.assetId,
                              video_url: input.url,
                              updated_at: new Date().toISOString(),
                          };
                const { error } = await supabase
                    .from('guests')
                    .update(update)
                    .eq('id', input.guestId);

                if (error) {
                    throw error;
                }
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
        const supabase = createServiceClient();
        await auditedMutation(
            {
                action: 'guest_plate.updated',
                entityType: 'slide_assets',
                entityId: input.slideId,
                next: { title: input.title, status, guests: guestIds.length },
            },
            async () => {
                const { error } = await supabase
                    .from('slide_assets')
                    .update({
                        title: input.title,
                        default_duration_seconds: input.defaultDurationSeconds ?? 30,
                        status,
                        metadata: { guestIds },
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', input.slideId)
                    .eq('template_id', 'guest-lineup');

                if (error) {
                    throw error;
                }
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
        const supabase = createServiceClient();
        await auditedMutation(
            {
                action: 'guest_plate.archived',
                entityType: 'slide_assets',
                entityId: slideId,
                next: { status: 'archived' },
            },
            async () => {
                const { error } = await supabase
                    .from('slide_assets')
                    .update({ status: 'archived', updated_at: new Date().toISOString() })
                    .eq('id', slideId)
                    .eq('template_id', 'guest-lineup');

                if (error) {
                    throw error;
                }
            },
        );
        revalidatePath('/admin/guests');
        revalidatePath('/admin/slides');

        return ok(undefined);
    } catch (error) {
        return err(extractError(error));
    }
}
