import { cookies } from 'next/headers';
import crypto from 'node:crypto';

import { eq } from 'drizzle-orm';

import { ADMIN_SESSION_COOKIE } from './auth-constants';
import { adminOperators, adminSessions } from '../db/schema';
import { getDb } from '../db/client';

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
            const db = await getDb();
            await db
                .update(adminSessions)
                .set({ revokedAt: new Date().toISOString() })
                .where(eq(adminSessions.sessionHash, hashSecret(sessionToken)));
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

    if (!isSafeAdminReturnPath(value)) {
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

function isSafeAdminReturnPath(value: string) {
    if (value.startsWith('/admin/login')) {
        return false;
    }

    return value.startsWith('/admin') || value === '/live' || value.startsWith('/live?');
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
    const db = await getDb();
    const [operatorRow] = await db
        .select({
            id: adminOperators.id,
            handle: adminOperators.handle,
            displayName: adminOperators.displayName,
            role: adminOperators.role,
            tokenHash: adminOperators.tokenHash,
            status: adminOperators.status,
        })
        .from(adminOperators)
        .where(eq(adminOperators.handle, handle))
        .limit(1);

    if (!operatorRow || operatorRow.status !== 'active') {
        return null;
    }

    if (!safeEqual(hashSecret(input.token), operatorRow.tokenHash)) {
        return null;
    }

    const sessionToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();
    const [inserted] = await db
        .insert(adminSessions)
        .values({
            operatorId: operatorRow.id,
            sessionHash: hashSecret(sessionToken),
            expiresAt,
        })
        .returning({ id: adminSessions.id });

    if (!inserted) {
        throw new Error('Failed to create session');
    }

    return {
        token: sessionToken,
        session: {
            operatorId: operatorRow.id,
            handle: operatorRow.handle,
            displayName: operatorRow.displayName,
            role: operatorRow.role as OperatorRole,
            sessionId: inserted.id,
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
        const db = await getDb();
        const [sessionRow] = await db
            .select({
                id: adminSessions.id,
                expiresAt: adminSessions.expiresAt,
                revokedAt: adminSessions.revokedAt,
                operatorId: adminSessions.operatorId,
            })
            .from(adminSessions)
            .where(eq(adminSessions.sessionHash, hashSecret(sessionToken)))
            .limit(1);

        if (
            !sessionRow ||
            sessionRow.revokedAt ||
            new Date(sessionRow.expiresAt).getTime() <= Date.now()
        ) {
            return null;
        }
        const [operatorRow] = await db
            .select({
                id: adminOperators.id,
                handle: adminOperators.handle,
                displayName: adminOperators.displayName,
                role: adminOperators.role,
                status: adminOperators.status,
            })
            .from(adminOperators)
            .where(eq(adminOperators.id, sessionRow.operatorId))
            .limit(1);

        if (!operatorRow || operatorRow.status !== 'active') {
            return null;
        }

        return {
            operatorId: operatorRow.id,
            handle: operatorRow.handle,
            displayName: operatorRow.displayName,
            role: operatorRow.role as OperatorRole,
            sessionId: sessionRow.id,
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
