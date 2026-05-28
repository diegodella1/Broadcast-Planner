import { existsSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const DEFAULT_FETCH_TIMEOUT_MS = 8000;

export function createServiceClient() {
    const url = normalizeLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error('Missing Supabase service environment');
    }

    return createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: fetchWithTimeout },
    });
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
    const timeoutMs = readTimeout();
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    const abort = () => controller.abort(upstreamSignal?.reason);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    if (upstreamSignal?.aborted) {
        abort();
    } else {
        upstreamSignal?.addEventListener('abort', abort, { once: true });
    }

    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
        upstreamSignal?.removeEventListener('abort', abort);
    }
}

function readTimeout() {
    const value = Number(process.env.SUPABASE_FETCH_TIMEOUT_MS);

    return Number.isFinite(value) && value > 0 ? value : DEFAULT_FETCH_TIMEOUT_MS;
}

function normalizeLocalSupabaseUrl(url: string | undefined) {
    if (!url || isRunningInDocker()) {
        return url;
    }

    try {
        const parsed = new URL(url);

        if (parsed.hostname === 'host.docker.internal') {
            parsed.hostname = '127.0.0.1';

            return parsed.toString();
        }
    } catch (error) {
        console.error('[lib/supabase/server.ts:normalizeLocalSupabaseUrl]', error);

        return url;
    }

    return url;
}

function isRunningInDocker() {
    return process.env.RUNNING_IN_DOCKER === '1' || existsSync('/.dockerenv');
}
