import { eq } from 'drizzle-orm';

import { decryptSecret, encryptSecret, maskSecret } from '../auth/crypto';
import { auditedMutation } from '../audit/audit';
import { getDb } from '../db/client';
import { integrationSettings } from '../db/schema';

import type { IntegrationSetting } from '../settings';

/**
 * Reuters credential storage. Mirrors the Vimeo pattern in `lib/settings.ts`.
 *
 * The OAuth2 triple (client_id, client_secret, refresh_token) is packed into a
 * single JSON-encoded string before encryption with `encryptSecret` so that
 * the existing single-column schema (`integration_settings.encrypted_secret`)
 * is reused without a migration. Empty/missing fields are stored as the empty
 * string; consumers must check for non-empty before calling Reuters.
 *
 * Env override: when ALL of REUTERS_CLIENT_ID, REUTERS_CLIENT_SECRET and
 * REUTERS_REFRESH_TOKEN are set, the env values win and the DB is bypassed.
 */

export type ReutersCredentials = {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
};

const PROVIDER = 'reuters';

export async function saveReutersSettings(input: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
}): Promise<void> {
    const existing = await getStoredCredentials();
    const merged: ReutersCredentials = {
        clientId: input.clientId ?? existing?.clientId ?? '',
        clientSecret: input.clientSecret ?? existing?.clientSecret ?? '',
        refreshToken: input.refreshToken ?? existing?.refreshToken ?? '',
    };
    const encryptedSecret = encryptSecret(JSON.stringify(merged));
    const now = new Date().toISOString();

    await auditedMutation(
        {
            actor: 'admin',
            action: 'settings.reuters.updated',
            entityType: 'integration_settings',
            entityId: PROVIDER,
            next: {
                client_id: maskSecret(merged.clientId),
                client_secret: merged.clientSecret ? 'set' : 'unset',
                refresh_token: merged.refreshToken ? 'set' : 'unset',
            },
        },
        async () => {
            const db = await getDb();

            await db
                .insert(integrationSettings)
                .values({
                    provider: PROVIDER,
                    publicConfig: {},
                    encryptedSecret,
                    status: 'unknown',
                    updatedAt: now,
                })
                .onConflictDoUpdate({
                    target: integrationSettings.provider,
                    set: {
                        encryptedSecret,
                        status: 'unknown',
                        updatedAt: now,
                    },
                });
        },
    );
}

export async function getReutersCredentials(): Promise<ReutersCredentials | null> {
    const envClientId = process.env.REUTERS_CLIENT_ID;
    const envClientSecret = process.env.REUTERS_CLIENT_SECRET;
    const envRefreshToken = process.env.REUTERS_REFRESH_TOKEN;

    if (envClientId && envClientSecret && envRefreshToken) {
        return {
            clientId: envClientId,
            clientSecret: envClientSecret,
            refreshToken: envRefreshToken,
        };
    }

    return getStoredCredentials();
}

export async function getReutersSettings(): Promise<IntegrationSetting | null> {
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
        .where(eq(integrationSettings.provider, PROVIDER))
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

export async function markReutersStatus(
    status: 'connected' | 'invalid' | 'failed',
    errorMessage?: string,
): Promise<void> {
    const db = await getDb();

    await db
        .update(integrationSettings)
        .set({
            status,
            lastCheckedAt: new Date().toISOString(),
            lastError: errorMessage ?? null,
        })
        .where(eq(integrationSettings.provider, PROVIDER));
}

async function getStoredCredentials(): Promise<ReutersCredentials | null> {
    const db = await getDb();
    const [row] = await db
        .select({ encryptedSecret: integrationSettings.encryptedSecret })
        .from(integrationSettings)
        .where(eq(integrationSettings.provider, PROVIDER))
        .limit(1);

    if (!row?.encryptedSecret) {
        return null;
    }

    try {
        const raw = decryptSecret(row.encryptedSecret);
        const parsed: unknown = JSON.parse(raw);

        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        const obj = parsed as Record<string, unknown>;

        return {
            clientId: typeof obj.clientId === 'string' ? obj.clientId : '',
            clientSecret: typeof obj.clientSecret === 'string' ? obj.clientSecret : '',
            refreshToken: typeof obj.refreshToken === 'string' ? obj.refreshToken : '',
        };
    } catch (error) {
        console.error('[lib/reuters-credentials.ts:getStoredCredentials]', error);

        return null;
    }
}
