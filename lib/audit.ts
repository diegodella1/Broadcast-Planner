import { createServiceClient } from './supabase/server';
import { currentAuditActor } from './auth';

export type AuditResult = 'success' | 'failure';

export type AuditEventInput = {
    actor?: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    result?: AuditResult;
    metadata?: Record<string, unknown>;
};

export type AuditedMutationInput = AuditEventInput & {
    previous?: Record<string, unknown> | null;
    next?: Record<string, unknown> | null;
    correlationId?: string;
};

export type AuditEvent = {
    id: string;
    actor: string;
    action: string;
    entityType: string;
    entityId: string | null;
    result: AuditResult;
    metadata: Record<string, unknown>;
    createdAt: string;
};

export async function recordAuditEvent(input: AuditEventInput) {
    const supabase = createServiceClient();
    const actor = input.actor ?? (await currentAuditActor());
    const metadata = {
        ...(input.metadata ?? {}),
        result: input.result ?? 'success',
    };
    const { error } = await supabase.from('audit_log').insert({
        actor,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        metadata,
    });

    if (error) {
        throw error;
    }
}

export async function auditedMutation<T>(
    input: AuditedMutationInput,
    operation: () => Promise<T>,
): Promise<T> {
    const correlationId = input.correlationId ?? crypto.randomUUID();
    const actor = input.actor ?? (await currentAuditActor());
    const baseEvent = {
        actor,
        action: input.action,
        entityType: input.entityType,
        ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
    };

    try {
        const result = await operation();
        await recordAuditEvent({
            ...baseEvent,
            result: 'success',
            metadata: {
                ...(input.metadata ?? {}),
                ...(input.previous ? { previous: input.previous } : {}),
                ...(input.next ? { next: input.next } : {}),
                correlation_id: correlationId,
            },
        });

        return result;
    } catch (error) {
        await recordAuditEvent({
            ...baseEvent,
            result: 'failure',
            metadata: {
                ...(input.metadata ?? {}),
                ...(input.previous ? { previous: input.previous } : {}),
                ...(input.next ? { next: input.next } : {}),
                correlation_id: correlationId,
                error: error instanceof Error ? error.message : String(error),
            },
        }).catch(() => undefined);
        throw error;
    }
}

export function mapAuditEvent(row: Record<string, unknown>): AuditEvent {
    const metadata =
        typeof row.metadata === 'object' && row.metadata !== null
            ? (row.metadata as Record<string, unknown>)
            : {};
    const result = metadata.result === 'failure' ? 'failure' : 'success';

    return {
        id: String(row.id ?? ''),
        actor: String(row.actor ?? 'system'),
        action: String(row.action ?? ''),
        entityType: String(row.entity_type ?? ''),
        entityId:
            row.entity_id === null || row.entity_id === undefined ? null : String(row.entity_id),
        result,
        metadata,
        createdAt: String(row.created_at ?? ''),
    };
}
