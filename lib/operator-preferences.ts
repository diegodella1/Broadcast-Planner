import { and, desc, eq } from 'drizzle-orm';

import { getCurrentOperatorSession } from './auth/auth';
import { getDb } from './db/client';
import { operatorPreferences } from './db/schema';

export type MusicPreference = {
    enabled: boolean;
    volume: number;
    fade: 'none' | 'short';
};

const DEFAULT_MUSIC_PREFERENCE: MusicPreference = {
    enabled: false,
    volume: 50,
    fade: 'short',
};

export async function getMusicPreference(): Promise<MusicPreference> {
    const operator = await getCurrentOperatorSession();

    if (!operator || operator.operatorId === 'bootstrap') {
        return DEFAULT_MUSIC_PREFERENCE;
    }

    const db = await getDb();
    const [row] = await db
        .select({ value: operatorPreferences.value })
        .from(operatorPreferences)
        .where(
            and(
                eq(operatorPreferences.operatorId, operator.operatorId),
                eq(operatorPreferences.key, 'music'),
            ),
        )
        .limit(1);

    return parseMusicPreference(row?.value);
}

export async function getLatestMusicPreference(): Promise<MusicPreference> {
    const db = await getDb();
    const [row] = await db
        .select({ value: operatorPreferences.value })
        .from(operatorPreferences)
        .where(eq(operatorPreferences.key, 'music'))
        .orderBy(desc(operatorPreferences.updatedAt))
        .limit(1);

    return parseMusicPreference(row?.value);
}

export async function saveMusicPreference(input: Partial<MusicPreference>) {
    const operator = await getCurrentOperatorSession();

    if (!operator || operator.operatorId === 'bootstrap') {
        return DEFAULT_MUSIC_PREFERENCE;
    }

    const next = parseMusicPreference(input);
    const db = await getDb();

    await db
        .insert(operatorPreferences)
        .values({
            operatorId: operator.operatorId,
            key: 'music',
            value: next,
            updatedAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
            target: [operatorPreferences.operatorId, operatorPreferences.key],
            set: {
                value: next,
                updatedAt: new Date().toISOString(),
            },
        });

    return next;
}

function parseMusicPreference(value: unknown): MusicPreference {
    const source =
        typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
    const volume = Number(source.volume);

    return {
        enabled: source.enabled === true,
        volume: Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : 50,
        fade: source.fade === 'none' ? 'none' : 'short',
    };
}
