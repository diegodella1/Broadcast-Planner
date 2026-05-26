'use server';

import {
    goLiveWithReuters,
    goLiveWithVimeo,
    scheduleReutersBlock,
    scheduleVimeoBlock,
} from '@/lib/manual-broadcast';
import {
    goLiveNowSchema,
    goLiveReutersSchema,
    scheduleReutersBlockSchema,
    scheduleVimeoBlockSchema,
} from '@/lib/schemas';

export type ManualBroadcastResult =
    | { success: true; programBlockId: string }
    | { success: false; error: string };

export async function goLiveAction(input: {
    vimeoUri: string;
    preempt?: boolean;
}): Promise<ManualBroadcastResult> {
    const parsed = goLiveNowSchema.safeParse(input);

    if (!parsed.success) {
        return {
            success: false,
            error: parsed.error.issues[0]?.message ?? 'Invalid input',
        };
    }
    const result = await goLiveWithVimeo(parsed.data);

    if (!result.success) {
        return { success: false, error: result.error };
    }

    return { success: true, programBlockId: result.data.programBlockId };
}

export async function scheduleAction(input: {
    vimeoUri: string;
    startAt: string;
    airDate?: string;
}): Promise<ManualBroadcastResult> {
    const parsed = scheduleVimeoBlockSchema.safeParse(input);

    if (!parsed.success) {
        return {
            success: false,
            error: parsed.error.issues[0]?.message ?? 'Invalid input',
        };
    }
    const result = await scheduleVimeoBlock(parsed.data);

    if (!result.success) {
        return { success: false, error: result.error };
    }

    return { success: true, programBlockId: result.data.programBlockId };
}

export async function goLiveReutersAction(input: {
    assetId: string;
}): Promise<ManualBroadcastResult> {
    const parsed = goLiveReutersSchema.safeParse(input);

    if (!parsed.success) {
        return {
            success: false,
            error: parsed.error.issues[0]?.message ?? 'Invalid input',
        };
    }
    const result = await goLiveWithReuters(parsed.data);

    if (!result.success) {
        return { success: false, error: result.error };
    }

    return { success: true, programBlockId: result.data.programBlockId };
}

export async function scheduleReutersAction(input: {
    assetId: string;
    startAt: string;
    airDate?: string;
    durationSeconds?: number;
}): Promise<ManualBroadcastResult> {
    const parsed = scheduleReutersBlockSchema.safeParse(input);

    if (!parsed.success) {
        return {
            success: false,
            error: parsed.error.issues[0]?.message ?? 'Invalid input',
        };
    }
    const result = await scheduleReutersBlock(parsed.data);

    if (!result.success) {
        return { success: false, error: result.error };
    }

    return { success: true, programBlockId: result.data.programBlockId };
}
