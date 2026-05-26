import { decryptSecret, encryptSecret, maskSecret } from '../auth/crypto';
import { auditedMutation } from '../audit/audit';
import { createServiceClient } from '../supabase/server';

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
    const supabase = createServiceClient();
    const existing = await getStoredCredentials();
    const merged: ReutersCredentials = {
        clientId: input.clientId ?? existing?.clientId ?? '',
        clientSecret: input.clientSecret ?? existing?.clientSecret ?? '',
        refreshToken: input.refreshToken ?? existing?.refreshToken ?? '',
    };
    const encrypted_secret = encryptSecret(JSON.stringify(merged));
    const payload: Record<string, unknown> = {
        provider: PROVIDER,
        public_config: {},
        encrypted_secret,
        status: 'unknown',
        updated_at: new Date().toISOString(),
    };
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
            const { error } = await supabase
                .from('integration_settings')
                .upsert(payload, { onConflict: 'provider' });

            if (error) {
                throw error;
            }
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
    const supabase = createServiceClient();
    const { data } = await supabase
        .from('integration_settings')
        .select('provider, public_config, encrypted_secret, status, last_error, last_checked_at')
        .eq('provider', PROVIDER)
        .maybeSingle();

    if (!data) {
        return null;
    }

    return {
        provider: String(data.provider),
        publicConfig:
            typeof data.public_config === 'object' && data.public_config !== null
                ? (data.public_config as Record<string, unknown>)
                : {},
        status: String(data.status) as IntegrationSetting['status'],
        lastError: data.last_error ? String(data.last_error) : null,
        lastCheckedAt: data.last_checked_at ? String(data.last_checked_at) : null,
        hasSecret: Boolean(data.encrypted_secret),
    };
}

export async function markReutersStatus(
    status: 'connected' | 'invalid' | 'failed',
    errorMessage?: string,
): Promise<void> {
    const supabase = createServiceClient();
    await supabase
        .from('integration_settings')
        .update({
            status,
            last_checked_at: new Date().toISOString(),
            last_error: errorMessage ?? null,
        })
        .eq('provider', PROVIDER);
}

async function getStoredCredentials(): Promise<ReutersCredentials | null> {
    const supabase = createServiceClient();
    const { data } = await supabase
        .from('integration_settings')
        .select('encrypted_secret')
        .eq('provider', PROVIDER)
        .maybeSingle();

    if (!data?.encrypted_secret) {
        return null;
    }

    try {
        const raw = decryptSecret(String(data.encrypted_secret));
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
