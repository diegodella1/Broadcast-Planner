#!/usr/bin/env node

import { writeFileSync } from 'node:fs';

const outputPath = process.argv[2];
const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!outputPath || !baseUrl || !serviceKey) {
    console.error(
        'Usage: node scripts/export-supabase-to-d1.mjs <output.sql> with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
    process.exit(1);
}

const tableSpecs = [
    spec(
        'media_assets',
        [
            'id',
            'title',
            'description',
            'source_type',
            'media_kind',
            'asset_type',
            'url',
            'storage_bucket',
            'storage_path',
            'thumbnail_url',
            'duration_seconds',
            'status',
            'canonical_url',
            'playback_kind',
            'content_type',
            'file_size_bytes',
            'width',
            'height',
            'video_codec',
            'audio_codec',
            'bit_rate',
            'frame_rate',
            'quality_label',
            'etag',
            'last_modified',
            'metadata_status',
            'metadata_checked_at',
            'metadata_failures',
            'metadata_error',
            'metadata',
            'playback_readiness_status',
            'playback_checked_at',
            'playback_error',
            'lifecycle_state',
            'created_at',
            'updated_at',
        ],
        transformMediaAssets,
    ),
    spec('slide_assets', [
        'id',
        'title',
        'slide_type',
        'content',
        'image_url',
        'html_content',
        'template_id',
        'default_duration_seconds',
        'status',
        'metadata',
        'created_at',
        'updated_at',
    ]),
    spec('program_days', [
        'id',
        'air_date',
        'timezone',
        'status',
        'title',
        'notes',
        'fallback_asset_id',
        'created_at',
        'updated_at',
    ]),
    spec('program_blocks', [
        'id',
        'program_day_id',
        'title',
        'block_type',
        'category',
        'asset_id',
        'slide_id',
        'start_time',
        'start_time_seconds',
        'duration_seconds',
        'status',
        'hide_overlays',
        'fallback_asset_id',
        'notes',
        'metadata',
        'created_at',
        'updated_at',
    ]),
    spec('scheduled_layers', [
        'id',
        'program_block_id',
        'title',
        'layer_type',
        'asset_id',
        'slide_id',
        'start_time_seconds',
        'duration_seconds',
        'z_index',
        'position',
        'enabled',
        'locked',
        'created_at',
        'updated_at',
    ]),
    spec('admin_operators', [
        'id',
        'handle',
        'display_name',
        'role',
        'token_hash',
        'status',
        'created_at',
        'updated_at',
    ]),
    spec('operator_preferences', ['operator_id', 'key', 'value', 'updated_at']),
    spec('audit_log', [
        'id',
        'actor',
        'action',
        'entity_type',
        'entity_id',
        'metadata',
        'created_at',
    ]),
    spec('operator_runbook_checks', [
        'id',
        'program_day_id',
        'section',
        'item_key',
        'checked',
        'notes',
        'checked_at',
        'created_at',
        'updated_at',
    ]),
    spec('output_overrides', [
        'id',
        'program_day_id',
        'enabled',
        'source_type',
        'block_id',
        'asset_id',
        'slide_id',
        'stream_url',
        'stream_protocol',
        'label',
        'expires_at',
        'metadata',
        'created_by',
        'created_at',
        'updated_at',
    ]),
    spec('events', [
        'id',
        'title',
        'description',
        'image_url',
        'start_date',
        'end_date',
        'start_time',
        'end_time',
        'is_active',
        'order_index',
        'color',
        'title_font',
        'title_size',
        'title_color',
        'text_color',
        'overlay_opacity',
        'show_date_badge',
        'location',
        'schedule_times',
        'created_at',
        'updated_at',
    ]),
    spec('guests', [
        'id',
        'name',
        'role',
        'company',
        'host',
        'program',
        'category',
        'appearance_at',
        'photo_url',
        'photo_asset_id',
        'video_url',
        'video_asset_id',
        'color',
        'sort_order',
        'status',
        'metadata',
        'created_at',
        'updated_at',
    ]),
    spec(
        'integration_settings',
        [
            'provider',
            'public_config',
            'encrypted_secret',
            'status',
            'last_checked_at',
            'last_error',
            'created_at',
            'updated_at',
        ],
        (rows) => rows.filter((row) => row.provider !== 'vimeo'),
    ),
];

const statements = [
    '-- Generated by scripts/export-supabase-to-d1.mjs',
    `-- Generated at ${new Date().toISOString()}`,
    'PRAGMA foreign_keys = OFF;',
    'BEGIN TRANSACTION;',
];
const counts = {};

for (const table of tableSpecs) {
    const sourceRows = await fetchAllRows(table.name);
    const rows = table.transform(sourceRows);
    counts[table.name] = rows.length;
    statements.push(`DELETE FROM ${quoteIdentifier(table.name)};`);

    for (const row of rows) {
        statements.push(buildInsert(table, row));
    }
}

statements.push('COMMIT;', 'PRAGMA foreign_keys = ON;', '');
writeFileSync(outputPath, statements.join('\n'));

for (const [table, count] of Object.entries(counts)) {
    console.log(`${table}: ${count}`);
}
console.log(
    `wrote ${Object.values(counts).reduce((sum, count) => sum + count, 0)} rows to ${outputPath}`,
);

function spec(name, columns, transform = (rows) => rows) {
    return { name, columns, transform };
}

function transformMediaAssets(rows) {
    const canonicalUrls = new Set();

    return rows.map((row) => {
        const sourceType = mapSourceType(row.source_type);
        const isVimeo = row.source_type === 'vimeo';
        const metadata = asObject(row.metadata);
        const canonicalUrl =
            sourceType === 'public_url' && row.url && !canonicalUrls.has(row.url) ? row.url : null;

        if (canonicalUrl) {
            canonicalUrls.add(canonicalUrl);
        }

        return {
            ...row,
            source_type: sourceType,
            status: isVimeo ? 'archived' : row.status,
            canonical_url: row.canonical_url ?? canonicalUrl,
            playback_kind: row.playback_kind ?? inferPlaybackKind(row),
            metadata_status: isVimeo
                ? 'stale'
                : (row.metadata_status ?? statusMetadata(row.status)),
            metadata_failures: row.metadata_failures ?? 0,
            metadata: isVimeo
                ? {
                      ...metadata,
                      legacy_provider: 'vimeo',
                      legacy_vimeo_id: row.vimeo_id,
                      legacy_vimeo_uri: row.vimeo_uri,
                      legacy_vimeo_privacy: row.vimeo_privacy,
                      legacy_vimeo_embed_status: row.vimeo_embed_status,
                      archived_at: new Date().toISOString(),
                  }
                : metadata,
            playback_readiness_status: isVimeo
                ? 'review'
                : (row.playback_readiness_status ?? 'unchecked'),
        };
    });
}

function mapSourceType(sourceType) {
    if (sourceType === 'vimeo') return 'legacy_external';
    if (sourceType === 'supabase_image' || sourceType === 'supabase_audio') return 'uploaded';
    if (['remote_image', 'remote_mp4', 'hls', 'rtmp', 'reuters'].includes(sourceType)) {
        return 'public_url';
    }
    return sourceType;
}

function inferPlaybackKind(row) {
    if (row.source_type === 'hls') return 'hls';
    if (row.source_type === 'remote_image' || row.media_kind === 'image') return 'image';
    if (row.source_type === 'supabase_audio' || row.media_kind === 'audio') return 'audio';
    if (['remote_mp4', 'reuters'].includes(row.source_type) || row.media_kind === 'video') {
        return 'video_file';
    }
    return null;
}

function statusMetadata(status) {
    return status === 'ready' ? 'ready' : 'pending';
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function buildInsert(table, row) {
    const columns = table.columns.map(quoteIdentifier).join(', ');
    const values = table.columns.map((column) => sqlValue(row[column])).join(', ');
    return `INSERT OR REPLACE INTO ${quoteIdentifier(table.name)} (${columns}) VALUES (${values});`;
}

async function fetchAllRows(table) {
    const rows = [];

    for (let offset = 0; ; offset += 1000) {
        const response = await fetch(
            `${baseUrl}/rest/v1/${table}?select=*&limit=1000&offset=${offset}`,
            {
                headers: {
                    apikey: serviceKey,
                    Authorization: `Bearer ${serviceKey}`,
                },
            },
        );

        if (!response.ok) {
            throw new Error(`${table} export failed: ${response.status} ${await response.text()}`);
        }

        const page = await response.json();
        if (!Array.isArray(page)) {
            throw new Error(`${table} export returned a non-array payload`);
        }

        rows.push(...page);
        if (page.length < 1000) return rows;
    }
}

function quoteIdentifier(value) {
    return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlValue(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';

    const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `'${serialized.replaceAll("'", "''")}'`;
}
