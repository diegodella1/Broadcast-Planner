import { and, eq } from 'drizzle-orm';

import { getDb } from './db/client';
import { outputOverrides } from './db/schema';
import type { OutputOverride } from './types';

type Row = Record<string, unknown>;

export async function getActiveOutputOverride(programDayId?: string | null) {
    if (!programDayId) {
        return null;
    }

    const db = await getDb();
    const [row] = await db
        .select()
        .from(outputOverrides)
        .where(
            and(eq(outputOverrides.programDayId, programDayId), eq(outputOverrides.enabled, true)),
        )
        .limit(1);

    return row ? mapOutputOverride(row as unknown as Row) : null;
}

export { clearOutputOverride, setReutersOutputOverride } from './mutations/output';

export function mapOutputOverride(row: Row): OutputOverride {
    return {
        id: String(row.id ?? ''),
        programDayId: String(row.program_day_id ?? row.programDayId ?? ''),
        enabled: row.enabled !== false && row.enabled !== 0,
        sourceType: String(
            row.source_type ?? row.sourceType ?? 'scheduled_block',
        ) as OutputOverride['sourceType'],
        blockId: nullable(row.block_id ?? row.blockId),
        assetId: nullable(row.asset_id ?? row.assetId),
        slideId: nullable(row.slide_id ?? row.slideId),
        streamUrl: nullable(row.stream_url ?? row.streamUrl),
        streamProtocol: streamProtocol(row.stream_protocol ?? row.streamProtocol),
        label: nullable(row.label),
        expiresAt: nullable(row.expires_at ?? row.expiresAt),
        metadata:
            typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : {},
        createdBy: nullable(row.created_by ?? row.createdBy),
        createdAt: String(row.created_at ?? row.createdAt ?? ''),
        updatedAt: String(row.updated_at ?? row.updatedAt ?? ''),
    };
}

function streamProtocol(value: unknown) {
    return value === 'hls' || value === 'rtmp' ? value : null;
}

function nullable(value: unknown) {
    return value === null || value === undefined ? null : String(value);
}
