import crypto from 'node:crypto';

import { auditedMutation } from '../audit/audit';
import { hashSecret, requireRole } from './auth';
import { createServiceClient } from '../supabase/server';

export type AdminOperator = {
    id: string;
    handle: string;
    displayName: string;
    role: 'admin' | 'operator';
    status: 'active' | 'disabled';
};

export async function listOperators(): Promise<AdminOperator[]> {
    await requireRole(['admin']);
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from('admin_operators')
        .select('id, handle, display_name, role, status')
        .order('handle');

    if (error) {
        throw error;
    }

    return (data ?? []).map((row) => ({
        id: String(row.id),
        handle: String(row.handle),
        displayName: String(row.display_name),
        role: String(row.role) as AdminOperator['role'],
        status: String(row.status) as AdminOperator['status'],
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
    const supabase = createServiceClient();
    await auditedMutation(
        {
            action: 'admin_operator.created',
            entityType: 'admin_operators',
            entityId: handle,
            next: { handle, display_name: displayName, role },
        },
        async () => {
            const { error } = await supabase.from('admin_operators').upsert(
                {
                    handle,
                    display_name: displayName,
                    role,
                    token_hash: hashSecret(token),
                    status: 'active',
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'handle' },
            );

            if (error) {
                throw error;
            }
        },
    );

    return { handle, token };
}
