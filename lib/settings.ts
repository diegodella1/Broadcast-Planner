import { eq } from 'drizzle-orm';

import { decryptSecret, encryptSecret, maskSecret } from './auth/crypto';
import { auditedMutation } from './audit/audit';
import { getDb } from './db/client';
import { integrationSettings } from './db/schema';
import { PLAYOUT_TIMEZONE } from './helpers/time';

export type IntegrationSetting = {
    provider: string;
    publicConfig: Record<string, unknown>;
    secret?: string | null;
    status: 'unknown' | 'connected' | 'invalid' | 'failed';
    lastError?: string | null;
    lastCheckedAt?: string | null;
    hasSecret?: boolean;
};

export async function saveVimeoSettings(input: {
    token?: string;
    folderUri?: string;
    timezone?: string;
}) {
    const publicConfig = {
        folder_uri: input.folderUri || null,
        timezone: input.timezone || PLAYOUT_TIMEZONE,
    };
    const encrypted_secret = input.token ? encryptSecret(input.token) : null;
    const now = new Date().toISOString();

    await auditedMutation(
        {
            actor: 'admin',
            action: 'settings.vimeo.updated',
            entityType: 'integration_settings',
            entityId: 'vimeo',
            next: {
                token: encrypted_secret ? maskSecret(input.token) : 'unchanged',
                folder_uri: input.folderUri ?? null,
            },
        },
        async () => {
            const db = await getDb();
            const setValues: Record<string, unknown> = {
                publicConfig,
                status: 'unknown',
                updatedAt: now,
            };

            if (encrypted_secret) {
                setValues.encryptedSecret = encrypted_secret;
            }

            await db
                .insert(integrationSettings)
                .values({
                    provider: 'vimeo',
                    publicConfig,
                    status: 'unknown',
                    ...(encrypted_secret ? { encryptedSecret: encrypted_secret } : {}),
                    updatedAt: now,
                    createdAt: now,
                })
                .onConflictDoUpdate({
                    target: integrationSettings.provider,
                    set: setValues as Partial<typeof integrationSettings.$inferInsert>,
                });
        },
    );
}

export async function getVimeoToken(): Promise<string | null> {
    if (process.env.VIMEO_ACCESS_TOKEN) {
        return process.env.VIMEO_ACCESS_TOKEN;
    }

    const db = await getDb();
    const [row] = await db
        .select({ encryptedSecret: integrationSettings.encryptedSecret })
        .from(integrationSettings)
        .where(eq(integrationSettings.provider, 'vimeo'))
        .limit(1);

    if (!row?.encryptedSecret) {
        return null;
    }

    return decryptSecret(row.encryptedSecret);
}

export async function getVimeoSettings(): Promise<IntegrationSetting | null> {
    const db = await getDb();
    const [row] = await db
        .select({
            provider: integrationSettings.provider,
            publicConfig: integrationSettings.publicConfig,
            encryptedSecret: integrationSettings.encryptedSecret,
            status: integrationSettings.status,
            lastError: integrationSettings.lastError,
            lastCheckedAt: integrationSettings.lastCheckedAt,
        })
        .from(integrationSettings)
        .where(eq(integrationSettings.provider, 'vimeo'))
        .limit(1);

    if (!row) {
        return null;
    }

    return {
        provider: row.provider,
        publicConfig:
            typeof row.publicConfig === 'object' && row.publicConfig !== null
                ? (row.publicConfig as Record<string, unknown>)
                : {},
        status: row.status as IntegrationSetting['status'],
        lastError: row.lastError ?? null,
        lastCheckedAt: row.lastCheckedAt ?? null,
        hasSecret: Boolean(row.encryptedSecret),
    };
}

export async function markVimeoStatus(
    status: 'connected' | 'invalid' | 'failed',
    errorMessage?: string,
) {
    const db = await getDb();

    await db
        .update(integrationSettings)
        .set({
            status,
            lastCheckedAt: new Date().toISOString(),
            lastError: errorMessage ?? null,
        })
        .where(eq(integrationSettings.provider, 'vimeo'));
}

export async function recordVimeoSyncStatus(input: {
    status: 'connected' | 'invalid' | 'failed';
    syncedCount?: number;
    staleCount?: number;
    failedCount?: number;
    errorMessage?: string;
}) {
    const db = await getDb();
    const now = new Date().toISOString();

    const [existing] = await db
        .select({ publicConfig: integrationSettings.publicConfig })
        .from(integrationSettings)
        .where(eq(integrationSettings.provider, 'vimeo'))
        .limit(1);

    const publicConfig =
        typeof existing?.publicConfig === 'object' && existing.publicConfig !== null
            ? (existing.publicConfig as Record<string, unknown>)
            : {};

    const nextPublicConfig = {
        ...publicConfig,
        last_sync_at: now,
        last_sync_count: input.syncedCount ?? 0,
        last_sync_stale_count: input.staleCount ?? 0,
        last_sync_failed_count: input.failedCount ?? 0,
    };

    await db
        .insert(integrationSettings)
        .values({
            provider: 'vimeo',
            publicConfig: nextPublicConfig,
            status: input.status,
            lastCheckedAt: now,
            lastError: input.errorMessage ?? null,
            updatedAt: now,
            createdAt: now,
        })
        .onConflictDoUpdate({
            target: integrationSettings.provider,
            set: {
                publicConfig: nextPublicConfig,
                status: input.status,
                lastCheckedAt: now,
                lastError: input.errorMessage ?? null,
                updatedAt: now,
            },
        });
}
