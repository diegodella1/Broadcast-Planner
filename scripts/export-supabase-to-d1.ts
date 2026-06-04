/**
 * One-shot data migration: Supabase Postgres -> Cloudflare D1 (SQLite).
 *
 * Pages through all rows of each table via the Supabase REST API (service key,
 * read-only) and emits a single idempotent SQL seed file with INSERT OR REPLACE
 * statements that can be applied to D1 via `wrangler d1 execute`.
 *
 * Run: npx tsx scripts/export-supabase-to-d1.ts
 *
 * No secrets are hardcoded — Supabase URL + service key are read from .env.local.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ENV_PATH = resolve(ROOT, '.env.local');
const OUT_PATH = resolve(ROOT, 'drizzle/seed-from-supabase.sql');
const PAGE_SIZE = 1000;

/**
 * Tables to migrate, in FK-safe insert order. The `columns` allowlist is the
 * exact D1 column set per table (snake_case, identical to Postgres). Any key
 * returned by the REST API that is not in this list is ignored, guarding
 * against drifted/extra Postgres-only columns.
 */
const TABLES: { name: string; columns: string[] }[] = [
    {
        name: 'media_assets',
        columns: [
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
            'vimeo_id',
            'vimeo_uri',
            'vimeo_privacy',
            'vimeo_embed_status',
            'metadata',
            'playback_readiness_status',
            'playback_checked_at',
            'playback_error',
            'lifecycle_state',
            'created_at',
            'updated_at',
        ],
    },
    {
        name: 'slide_assets',
        columns: [
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
        ],
    },
    {
        name: 'program_days',
        columns: [
            'id',
            'air_date',
            'timezone',
            'status',
            'title',
            'notes',
            'fallback_asset_id',
            'created_at',
            'updated_at',
        ],
    },
    {
        name: 'program_blocks',
        columns: [
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
        ],
    },
    {
        name: 'scheduled_layers',
        columns: [
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
        ],
    },
    {
        name: 'guests',
        columns: [
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
        ],
    },
    {
        name: 'integration_settings',
        columns: [
            'provider',
            'public_config',
            'encrypted_secret',
            'status',
            'last_checked_at',
            'last_error',
            'created_at',
            'updated_at',
        ],
    },
    {
        name: 'operator_preferences',
        columns: ['operator_id', 'key', 'value', 'updated_at'],
    },
    {
        name: 'audit_log',
        columns: ['id', 'actor', 'action', 'entity_type', 'entity_id', 'metadata', 'created_at'],
    },
];

function loadEnv(): { url: string; key: string } {
    const raw = readFileSync(ENV_PATH, 'utf8');
    const env: Record<string, string> = {};
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const eq = trimmed.indexOf('=');
        if (eq === -1) {
            continue;
        }
        env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error(
            'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local',
        );
    }
    return { url: url.replace(/\/+$/, ''), key };
}

/** Encode a single JS value (from REST JSON) into a SQLite literal. */
function encodeValue(value: unknown): string {
    if (value === null || value === undefined) {
        return 'NULL';
    }
    if (typeof value === 'boolean') {
        return value ? '1' : '0';
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value) : 'NULL';
    }
    if (typeof value === 'string') {
        return quote(value);
    }
    // object / array (jsonb or text[] columns) -> JSON text literal
    return quote(JSON.stringify(value));
}

function quote(s: string): string {
    return `'${s.replace(/'/g, "''")}'`;
}

async function fetchAllRows(
    base: string,
    key: string,
    table: string,
): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    let offset = 0;
    for (;;) {
        const url = `${base}/rest/v1/${table}?select=*`;
        const res = await fetch(url, {
            headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
                Range: `${offset}-${offset + PAGE_SIZE - 1}`,
                'Range-Unit': 'items',
                Prefer: 'count=exact',
            },
        });
        if (!res.ok && res.status !== 206) {
            const body = await res.text();
            throw new Error(`REST ${table} ${res.status}: ${body}`);
        }
        const page = (await res.json()) as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) {
            break;
        }
        offset += PAGE_SIZE;
    }
    return rows;
}

function buildInsert(table: string, columns: string[], row: Record<string, unknown>): string {
    const cols = columns.map((c) => `"${c}"`).join(', ');
    const vals = columns.map((c) => encodeValue(row[c])).join(', ');
    return `INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${vals});`;
}

async function main(): Promise<void> {
    const { url, key } = loadEnv();
    const out: string[] = [
        '-- Auto-generated by scripts/export-supabase-to-d1.ts',
        `-- Generated at ${new Date().toISOString()}`,
        'PRAGMA foreign_keys=OFF;',
        '',
    ];
    let totalStatements = 0;
    const perTable: { table: string; rows: number }[] = [];

    for (const { name, columns } of TABLES) {
        const rows = await fetchAllRows(url, key, name);
        perTable.push({ table: name, rows: rows.length });
        if (rows.length === 0) {
            out.push(`-- ${name}: 0 rows (skipped)`, '');
            continue;
        }
        out.push(`-- ${name}: ${rows.length} rows`);
        for (const row of rows) {
            out.push(buildInsert(name, columns, row));
            totalStatements++;
        }
        out.push('');
    }

    out.push('PRAGMA foreign_keys=ON;', '');
    writeFileSync(OUT_PATH, out.join('\n'), 'utf8');

    console.log('Per-table row counts exported:');
    for (const { table, rows } of perTable) {
        console.log(`  ${table.padEnd(24)} ${rows}`);
    }
    console.log(`\nTotal INSERT statements: ${totalStatements}`);
    console.log(`SQL file: ${OUT_PATH}`);
}

main().catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
});
