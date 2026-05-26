import { cookies } from 'next/headers';
import crypto from 'node:crypto';

import { ADMIN_SESSION_COOKIE } from './auth-constants';
import { createServiceClient } from './supabase/server';

export { ADMIN_SESSION_COOKIE } from './auth-constants';

export type OperatorRole = 'admin' | 'operator';

export type OperatorSession = {
    operatorId: string;
    handle: string;
    displayName: string;
    role: OperatorRole;
    sessionId: string;
};

export async function requireAdmin() {
    const session = await getCurrentOperatorSession();

    if (session) {
        return session;
    }
    const token = process.env.ADMIN_BOOTSTRAP_TOKEN;

    if (!token) {
        if (shouldFailClosedForMissingAdminToken()) {
            throw new Error('Admin auth not configured');
        }

        return bootstrapSession();
    }
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get('rpm_admin_token')?.value;

    if (cookieToken !== token) {
        throw new Error('Unauthorized');
    }

    return bootstrapSession();
}

export async function revokeCurrentOperatorSession() {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

    if (sessionToken) {
        try {
            const supabase = createServiceClient();
            await supabase
                .from('admin_sessions')
                .update({ revoked_at: new Date().toISOString() })
                .eq('session_hash', hashSecret(sessionToken));
        } catch {
            // Logout must still clear browser access if the revoke write fails.
        }
    }
    cookieStore.delete(ADMIN_SESSION_COOKIE);
    cookieStore.delete('rpm_admin_token');
}

export function safeAdminReturnTo(value: string | null | undefined) {
    if (!value) {
        return '/admin/calendar';
    }

    if (!value.startsWith('/admin') || value.startsWith('/admin/login')) {
        return '/admin/calendar';
    }

    if (value.startsWith('//')) {
        return '/admin/calendar';
    }

    try {
        const parsed = new URL(value, 'http://local');

        if (parsed.origin !== 'http://local') {
            return '/admin/calendar';
        }

        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return '/admin/calendar';
    }
}

export async function requireRole(roles: OperatorRole[]) {
    const session = (await requireAdmin()) ?? bootstrapSession();

    if (session.operatorId === 'bootstrap') {
        return session;
    }

    if (!roles.includes(session.role)) {
        throw new Error('Forbidden');
    }

    return session;
}

export function isAdminTokenValid(token: string) {
    return Boolean(
        process.env.ADMIN_BOOTSTRAP_TOKEN && token === process.env.ADMIN_BOOTSTRAP_TOKEN,
    );
}

export async function createOperatorSession(input: {
    handle?: string;
    token: string;
}): Promise<{ token: string; session: OperatorSession } | null> {
    const handle = input.handle?.trim();

    if (!handle) {
        if (!isAdminTokenValid(input.token)) {
            return null;
        }

        return { token: input.token, session: bootstrapSession() };
    }
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from('admin_operators')
        .select('id, handle, display_name, role, token_hash, status')
        .eq('handle', handle)
        .eq('status', 'active')
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data?.id || !safeEqual(hashSecret(input.token), String(data.token_hash))) {
        return null;
    }

    const sessionToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
    const { data: inserted, error: insertError } = await supabase
        .from('admin_sessions')
        .insert({
            operator_id: String(data.id),
            session_hash: hashSecret(sessionToken),
            expires_at: expiresAt,
        })
        .select('id')
        .single();

    if (insertError) {
        throw insertError;
    }

    return {
        token: sessionToken,
        session: {
            operatorId: String(data.id),
            handle: String(data.handle),
            displayName: String(data.display_name),
            role: String(data.role) as OperatorRole,
            sessionId: String(inserted.id),
        },
    };
}

export async function getCurrentOperatorSession(): Promise<OperatorSession | null> {
    try {
        const cookieStore = await cookies();
        const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

        if (!sessionToken) {
            return null;
        }
        const supabase = createServiceClient();
        const { data, error } = await supabase
            .from('admin_sessions')
            .select(
                'id, expires_at, revoked_at, admin_operators(id, handle, display_name, role, status)',
            )
            .eq('session_hash', hashSecret(sessionToken))
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data || data.revoked_at || new Date(String(data.expires_at)).getTime() <= Date.now()) {
            return null;
        }
        const operatorRow = Array.isArray(data.admin_operators)
            ? data.admin_operators[0]
            : data.admin_operators;

        if (!operatorRow || String(operatorRow.status) !== 'active') {
            return null;
        }

        return {
            operatorId: String(operatorRow.id),
            handle: String(operatorRow.handle),
            displayName: String(operatorRow.display_name),
            role: String(operatorRow.role) as OperatorRole,
            sessionId: String(data.id),
        };
    } catch {
        return null;
    }
}

export async function currentAuditActor() {
    const session = await getCurrentOperatorSession();

    return session ? `${session.handle}:${session.role}` : 'bootstrap-admin';
}

export function hashSecret(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function shouldFailClosedForMissingAdminToken(env = process.env) {
    return isProductionLikeRuntime(env);
}

export function isProductionLikeRuntime(env = process.env) {
    return (
        env.NODE_ENV === 'production' ||
        env.APP_BASE_URL?.startsWith('https://') ||
        env.NEXT_PUBLIC_APP_BASE_URL?.startsWith('https://')
    );
}

function bootstrapSession(): OperatorSession {
    return {
        operatorId: 'bootstrap',
        handle: 'bootstrap',
        displayName: 'Bootstrap Admin',
        role: 'admin',
        sessionId: 'bootstrap',
    };
}

function safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return (
        leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
    );
}
