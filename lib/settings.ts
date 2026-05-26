import { decryptSecret, encryptSecret, maskSecret } from './auth/crypto';
import { auditedMutation } from './audit/audit';
import { createServiceClient } from './supabase/server';
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
    const supabase = createServiceClient();
    const publicConfig = {
        folder_uri: input.folderUri || null,
        timezone: input.timezone || PLAYOUT_TIMEZONE,
    };
    const encrypted_secret = input.token ? encryptSecret(input.token) : null;
    const payload: Record<string, unknown> = {
        provider: 'vimeo',
        public_config: publicConfig,
        status: 'unknown',
        updated_at: new Date().toISOString(),
    };

    if (encrypted_secret) {
        payload.encrypted_secret = encrypted_secret;
    }
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
            const { error } = await supabase
                .from('integration_settings')
                .upsert(payload, { onConflict: 'provider' });

            if (error) {
                throw error;
            }
        },
    );
}

export async function getVimeoToken(): Promise<string | null> {
    if (process.env.VIMEO_ACCESS_TOKEN) {
        return process.env.VIMEO_ACCESS_TOKEN;
    }
    const supabase = createServiceClient();
    const { data } = await supabase
        .from('integration_settings')
        .select('encrypted_secret')
        .eq('provider', 'vimeo')
        .maybeSingle();

    if (!data?.encrypted_secret) {
        return null;
    }

    return decryptSecret(data.encrypted_secret);
}

export async function getVimeoSettings(): Promise<IntegrationSetting | null> {
    const supabase = createServiceClient();
    const { data } = await supabase
        .from('integration_settings')
        .select('provider, public_config, encrypted_secret, status, last_error, last_checked_at')
        .eq('provider', 'vimeo')
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

export async function markVimeoStatus(
    status: 'connected' | 'invalid' | 'failed',
    errorMessage?: string,
) {
    const supabase = createServiceClient();
    await supabase
        .from('integration_settings')
        .update({
            status,
            last_checked_at: new Date().toISOString(),
            last_error: errorMessage ?? null,
        })
        .eq('provider', 'vimeo');
}

export async function recordVimeoSyncStatus(input: {
    status: 'connected' | 'invalid' | 'failed';
    syncedCount?: number;
    staleCount?: number;
    failedCount?: number;
    errorMessage?: string;
}) {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const { data } = await supabase
        .from('integration_settings')
        .select('public_config')
        .eq('provider', 'vimeo')
        .maybeSingle();
    const publicConfig =
        typeof data?.public_config === 'object' && data.public_config !== null
            ? (data.public_config as Record<string, unknown>)
            : {};

    const payload = {
        provider: 'vimeo',
        public_config: {
            ...publicConfig,
            last_sync_at: now,
            last_sync_count: input.syncedCount ?? 0,
            last_sync_stale_count: input.staleCount ?? 0,
            last_sync_failed_count: input.failedCount ?? 0,
        },
        status: input.status,
        last_checked_at: now,
        last_error: input.errorMessage ?? null,
        updated_at: now,
    };

    const { error } = await supabase
        .from('integration_settings')
        .upsert(payload, { onConflict: 'provider' });

    if (error) {
        throw error;
    }
}
