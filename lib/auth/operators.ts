import crypto from 'node:crypto';

import { asc } from 'drizzle-orm';

import { auditedMutation } from '../audit/audit';
import { hashSecret, requireRole } from './auth';
import { adminOperators } from '../db/schema';
import { getDb } from '../db/client';

export type AdminOperator = {
    id: string;
    handle: string;
    displayName: string;
    role: 'admin' | 'operator';
    status: 'active' | 'disabled';
};

export async function listOperators(): Promise<AdminOperator[]> {
    await requireRole(['admin']);
    const db = await getDb();
    const rows = await db
        .select({
            id: adminOperators.id,
            handle: adminOperators.handle,
            displayName: adminOperators.displayName,
            role: adminOperators.role,
            status: adminOperators.status,
        })
        .from(adminOperators)
        .orderBy(asc(adminOperators.handle));

    return rows.map((row) => ({
        id: row.id,
        handle: row.handle,
        displayName: row.displayName,
        role: row.role as AdminOperator['role'],
        status: row.status as AdminOperator['status'],
    }));
}

export async function createOperator(input: {
    handle: string;
    displayName: string;
    role: string;
    token?: string;
}) {
    await requireRole(['admin']);
    const handle = input.handle.trim().toLowerCase();
    const displayName = input.displayName.trim() || handle;
    const role = input.role === 'admin' ? 'admin' : 'operator';
    const token = input.token?.trim() || crypto.randomBytes(18).toString('base64url');

    if (!/^[a-z0-9._-]{2,80}$/.test(handle)) {
        throw new Error(
            'Operator handle must use lowercase letters, numbers, dot, dash or underscore',
        );
    }
    const db = await getDb();
    await auditedMutation(
        {
            action: 'admin_operator.created',
            entityType: 'admin_operators',
            entityId: handle,
            next: { handle, display_name: displayName, role },
        },
        async () => {
            await db
                .insert(adminOperators)
                .values({
                    handle,
                    displayName,
                    role,
                    tokenHash: hashSecret(token),
                    status: 'active',
                    updatedAt: new Date().toISOString(),
                })
                .onConflictDoUpdate({
                    target: adminOperators.handle,
                    set: {
                        displayName,
                        role,
                        tokenHash: hashSecret(token),
                        status: 'active',
                        updatedAt: new Date().toISOString(),
                    },
                });
        },
    );

    return { handle, token };
}
