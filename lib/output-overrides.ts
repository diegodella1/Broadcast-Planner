import { createServiceClient } from './supabase/server';

import type { OutputOverride } from './types';

type Row = Record<string, unknown>;

export async function getActiveOutputOverride(programDayId?: string | null) {
    if (!programDayId) {
        return null;
    }
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from('output_overrides')
        .select('*')
        .eq('program_day_id', programDayId)
        .eq('enabled', true)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data ? mapOutputOverride(data as Row) : null;
}

export { clearOutputOverride, setReutersOutputOverride } from './mutations/output';

export function mapOutputOverride(row: Row): OutputOverride {
    return {
        id: String(row.id ?? ''),
        programDayId: String(row.program_day_id ?? ''),
        enabled: row.enabled !== false,
        sourceType: String(row.source_type ?? 'scheduled_block') as OutputOverride['sourceType'],
        blockId: nullable(row.block_id),
        assetId: nullable(row.asset_id),
        slideId: nullable(row.slide_id),
        streamUrl: nullable(row.stream_url),
        streamProtocol: streamProtocol(row.stream_protocol),
        label: nullable(row.label),
        expiresAt: nullable(row.expires_at),
        metadata:
            typeof row.metadata === 'object' && row.metadata !== null
                ? (row.metadata as Record<string, unknown>)
                : {},
        createdBy: nullable(row.created_by),
        createdAt: String(row.created_at ?? ''),
        updatedAt: String(row.updated_at ?? ''),
    };
}

function streamProtocol(value: unknown) {
    return value === 'hls' || value === 'rtmp' ? value : null;
}

function nullable(value: unknown) {
    return value === null || value === undefined ? null : String(value);
}
