/**
 * Drizzle ORM schema for Cloudflare D1 (SQLite).
 *
 * Ported from rtvplanner-supabase-install.sql.
 * Postgres-to-SQLite mapping notes:
 *   uuid          → text  (IDs generated via crypto.randomUUID() in app)
 *   timestamptz   → text  (ISO 8601 strings)
 *   jsonb         → text  mode:'json'
 *   boolean       → integer  mode:'boolean'
 *   text[] arrays → text  mode:'json'  (stored as JSON array)
 *   date          → text  (YYYY-MM-DD string)
 *   time          → text  (HH:MM:SS string)
 *   numeric       → real
 *   integer       → integer
 *   Postgres ENUMs → plain text columns (SQLite has no native ENUM type)
 *   RLS / triggers / functions → dropped (handled at app layer)
 *
 * The unique partial index on output_overrides(program_day_id) WHERE enabled=1
 * cannot be expressed via Drizzle's index() DSL for SQLite; it is emitted in
 * the migration SQL using a raw `CREATE UNIQUE INDEX … WHERE enabled = 1`.
 */

import { sql } from 'drizzle-orm';
import {
    sqliteTable,
    text,
    integer,
    real,
    uniqueIndex,
    index,
    primaryKey,
} from 'drizzle-orm/sqlite-core';

// ─── integration_settings ────────────────────────────────────────────────────
// PK is `provider` text (not uuid) — kept as-is from the SQL schema.

export const integrationSettings = sqliteTable('integration_settings', {
    provider: text('provider').primaryKey(),
    publicConfig: text('public_config', { mode: 'json' })
        .notNull()
        .$defaultFn(() => ({})),
    encryptedSecret: text('encrypted_secret'),
    status: text('status').notNull().default('unknown'),
    lastCheckedAt: text('last_checked_at'),
    lastError: text('last_error'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export type IntegrationSettingsRow = typeof integrationSettings.$inferSelect;
export type InsertIntegrationSettingsRow = typeof integrationSettings.$inferInsert;

// ─── media_assets ────────────────────────────────────────────────────────────
// source_type enum → text; media_kind enum → text; asset_status enum → text.
// playback_readiness_status CHECK → enforced in app layer.
// lifecycle_state CHECK → enforced in app layer.

export const mediaAssets = sqliteTable('media_assets', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    description: text('description'),
    sourceType: text('source_type').notNull(),
    mediaKind: text('media_kind').notNull(),
    assetType: text('asset_type').notNull(),
    url: text('url'),
    storageBucket: text('storage_bucket'),
    storagePath: text('storage_path'),
    thumbnailUrl: text('thumbnail_url'),
    durationSeconds: integer('duration_seconds'),
    status: text('status').notNull().default('draft'),
    vimeoId: text('vimeo_id').unique(),
    vimeoUri: text('vimeo_uri'),
    vimeoPrivacy: text('vimeo_privacy'),
    vimeoEmbedStatus: text('vimeo_embed_status'),
    metadata: text('metadata', { mode: 'json' })
        .notNull()
        .$defaultFn(() => ({})),
    playbackReadinessStatus: text('playback_readiness_status').notNull().default('unchecked'),
    playbackCheckedAt: text('playback_checked_at'),
    playbackError: text('playback_error'),
    lifecycleState: text('lifecycle_state').notNull().default('reviewed'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export type MediaAssetRow = typeof mediaAssets.$inferSelect;
export type InsertMediaAssetRow = typeof mediaAssets.$inferInsert;

// ─── slide_assets ────────────────────────────────────────────────────────────
// slide_type CHECK → enforced in app layer.
// status CHECK → enforced in app layer.

export const slideAssets = sqliteTable('slide_assets', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    title: text('title').notNull(),
    slideType: text('slide_type').notNull(),
    content: text('content'),
    imageUrl: text('image_url'),
    htmlContent: text('html_content'),
    templateId: text('template_id'),
    defaultDurationSeconds: integer('default_duration_seconds'),
    status: text('status').notNull().default('draft'),
    metadata: text('metadata', { mode: 'json' })
        .notNull()
        .$defaultFn(() => ({})),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export type SlideAssetRow = typeof slideAssets.$inferSelect;
export type InsertSlideAssetRow = typeof slideAssets.$inferInsert;

// ─── program_days ────────────────────────────────────────────────────────────
// air_date UNIQUE date → text (YYYY-MM-DD).
// program_status enum → text.
// fallback_asset_id FK → ON DELETE SET NULL.

export const programDays = sqliteTable('program_days', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    airDate: text('air_date').notNull().unique(),
    timezone: text('timezone').notNull().default('America/Los_Angeles'),
    status: text('status').notNull().default('draft'),
    title: text('title'),
    notes: text('notes'),
    fallbackAssetId: text('fallback_asset_id').references(() => mediaAssets.id, {
        onDelete: 'set null',
    }),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export type ProgramDayRow = typeof programDays.$inferSelect;
export type InsertProgramDayRow = typeof programDays.$inferInsert;

// ─── program_blocks ──────────────────────────────────────────────────────────
// block_type enum → text; program_status enum → text.
// start_time (Postgres TIME) → text (HH:MM:SS).
// hide_overlays boolean → integer mode:'boolean'.
// category CHECK → enforced in app layer.
// The overlap trigger is dropped; overlap enforcement moves to app layer.

export const programBlocks = sqliteTable('program_blocks', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    programDayId: text('program_day_id')
        .notNull()
        .references(() => programDays.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    blockType: text('block_type').notNull(),
    category: text('category').notNull(),
    assetId: text('asset_id').references(() => mediaAssets.id, {
        onDelete: 'set null',
    }),
    slideId: text('slide_id').references(() => slideAssets.id, {
        onDelete: 'set null',
    }),
    startTime: text('start_time').notNull(),
    startTimeSeconds: integer('start_time_seconds').notNull(),
    durationSeconds: integer('duration_seconds').notNull(),
    status: text('status').notNull().default('draft'),
    hideOverlays: integer('hide_overlays', { mode: 'boolean' }).notNull().default(false),
    fallbackAssetId: text('fallback_asset_id').references(() => mediaAssets.id, {
        onDelete: 'set null',
    }),
    notes: text('notes'),
    metadata: text('metadata', { mode: 'json' })
        .notNull()
        .$defaultFn(() => ({})),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export type ProgramBlockRow = typeof programBlocks.$inferSelect;
export type InsertProgramBlockRow = typeof programBlocks.$inferInsert;

// ─── scheduled_layers ────────────────────────────────────────────────────────
// layer_type enum → text; layer_position enum → text.
// enabled / locked boolean → integer mode:'boolean'.

export const scheduledLayers = sqliteTable('scheduled_layers', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    programBlockId: text('program_block_id')
        .notNull()
        .references(() => programBlocks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    layerType: text('layer_type').notNull(),
    assetId: text('asset_id').references(() => mediaAssets.id, {
        onDelete: 'set null',
    }),
    slideId: text('slide_id').references(() => slideAssets.id, {
        onDelete: 'set null',
    }),
    startTimeSeconds: integer('start_time_seconds').notNull().default(0),
    durationSeconds: integer('duration_seconds').notNull(),
    zIndex: integer('z_index').notNull().default(10),
    position: text('position').notNull().default('lower_third'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    locked: integer('locked', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export type ScheduledLayerRow = typeof scheduledLayers.$inferSelect;
export type InsertScheduledLayerRow = typeof scheduledLayers.$inferInsert;

// ─── audit_log ───────────────────────────────────────────────────────────────

export const auditLog = sqliteTable('audit_log', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    actor: text('actor').notNull().default('system'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    metadata: text('metadata', { mode: 'json' })
        .notNull()
        .$defaultFn(() => ({})),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export type AuditLogRow = typeof auditLog.$inferSelect;
export type InsertAuditLogRow = typeof auditLog.$inferInsert;

// ─── operator_runbook_checks ─────────────────────────────────────────────────
// section CHECK → enforced in app layer.
// checked boolean → integer mode:'boolean'.
// unique (program_day_id, section, item_key) → expressed via uniqueIndex.

export const operatorRunbookChecks = sqliteTable(
    'operator_runbook_checks',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        programDayId: text('program_day_id')
            .notNull()
            .references(() => programDays.id, { onDelete: 'cascade' }),
        section: text('section').notNull(),
        itemKey: text('item_key').notNull(),
        checked: integer('checked', { mode: 'boolean' }).notNull().default(false),
        notes: text('notes'),
        checkedAt: text('checked_at'),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text('updated_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => ({
        // mirrors: unique (program_day_id, section, item_key)
        uniqDaySectionItem: uniqueIndex('operator_runbook_checks_day_section_item_uniq').on(
            table.programDayId,
            table.section,
            table.itemKey,
        ),
        // mirrors: idx_operator_runbook_checks_day
        dayIdx: index('idx_operator_runbook_checks_day').on(
            table.programDayId,
            table.section,
            table.itemKey,
        ),
    }),
);

export type OperatorRunbookCheckRow = typeof operatorRunbookChecks.$inferSelect;
export type InsertOperatorRunbookCheckRow = typeof operatorRunbookChecks.$inferInsert;

// ─── admin_operators ─────────────────────────────────────────────────────────
// role CHECK → enforced in app layer.
// status CHECK → enforced in app layer.

export const adminOperators = sqliteTable('admin_operators', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    handle: text('handle').notNull().unique(),
    displayName: text('display_name').notNull(),
    role: text('role').notNull(),
    tokenHash: text('token_hash').notNull(),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export type AdminOperatorRow = typeof adminOperators.$inferSelect;
export type InsertAdminOperatorRow = typeof adminOperators.$inferInsert;

// ─── admin_sessions ──────────────────────────────────────────────────────────
// expires_at / revoked_at → text (ISO strings).

export const adminSessions = sqliteTable(
    'admin_sessions',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        operatorId: text('operator_id')
            .notNull()
            .references(() => adminOperators.id, { onDelete: 'cascade' }),
        sessionHash: text('session_hash').notNull().unique(),
        expiresAt: text('expires_at').notNull(),
        revokedAt: text('revoked_at'),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => ({
        // mirrors: idx_admin_sessions_operator
        operatorExpiresIdx: index('idx_admin_sessions_operator').on(
            table.operatorId,
            table.expiresAt,
        ),
    }),
);

export type AdminSessionRow = typeof adminSessions.$inferSelect;
export type InsertAdminSessionRow = typeof adminSessions.$inferInsert;

// ─── api_rate_limits ─────────────────────────────────────────────────────────
// PK is bucket_key text.
// reset_at → text (ISO string).
// hits → integer.

export const apiRateLimits = sqliteTable('api_rate_limits', {
    bucketKey: text('bucket_key').primaryKey(),
    hits: integer('hits').notNull().default(0),
    resetAt: text('reset_at').notNull(),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export type ApiRateLimitRow = typeof apiRateLimits.$inferSelect;
export type InsertApiRateLimitRow = typeof apiRateLimits.$inferInsert;

// ─── operator_preferences ────────────────────────────────────────────────────
// Composite PK (operator_id, key) — expressed via .primaryKey() on each col
// is not supported for composite PKs in this style; use the table-level
// primaryKey option instead via sql``. Drizzle sqlite-core supports
// primaryKey({ columns }) in the third argument.

export const operatorPreferences = sqliteTable(
    'operator_preferences',
    {
        operatorId: text('operator_id')
            .notNull()
            .references(() => adminOperators.id, { onDelete: 'cascade' }),
        key: text('key').notNull(),
        value: text('value', { mode: 'json' })
            .notNull()
            .$defaultFn(() => ({})),
        updatedAt: text('updated_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => ({
        pk: primaryKey({ columns: [table.operatorId, table.key] }),
    }),
);

export type OperatorPreferenceRow = typeof operatorPreferences.$inferSelect;
export type InsertOperatorPreferenceRow = typeof operatorPreferences.$inferInsert;

// ─── output_overrides ────────────────────────────────────────────────────────
// enabled boolean → integer mode:'boolean'.
// source_type CHECK → enforced in app layer.
// stream_protocol CHECK → enforced in app layer.
// expires_at → text (ISO string).
// The Postgres partial unique index (WHERE enabled) is emitted as a raw SQL
// index in the migration; Drizzle sqlite-core does not support WHERE clauses
// in index() at schema definition time.

export const outputOverrides = sqliteTable('output_overrides', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    programDayId: text('program_day_id')
        .notNull()
        .references(() => programDays.id, { onDelete: 'cascade' }),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    sourceType: text('source_type').notNull(),
    blockId: text('block_id').references(() => programBlocks.id, {
        onDelete: 'set null',
    }),
    assetId: text('asset_id').references(() => mediaAssets.id, {
        onDelete: 'set null',
    }),
    slideId: text('slide_id').references(() => slideAssets.id, {
        onDelete: 'set null',
    }),
    streamUrl: text('stream_url'),
    streamProtocol: text('stream_protocol'),
    label: text('label'),
    expiresAt: text('expires_at'),
    metadata: text('metadata', { mode: 'json' })
        .notNull()
        .$defaultFn(() => ({})),
    createdBy: text('created_by').references(() => adminOperators.id, {
        onDelete: 'set null',
    }),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
});

export type OutputOverrideRow = typeof outputOverrides.$inferSelect;
export type InsertOutputOverrideRow = typeof outputOverrides.$inferInsert;

// ─── events ──────────────────────────────────────────────────────────────────
// start_date / end_date → text (YYYY-MM-DD).
// start_time / end_time → text (HH:MM:SS).
// is_active / show_date_badge boolean → integer mode:'boolean'.
// overlay_opacity numeric → real.
// title_size CHECK → enforced in app layer.
// schedule_times jsonb → text mode:'json'.

export const events = sqliteTable(
    'events',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        title: text('title').notNull(),
        description: text('description'),
        imageUrl: text('image_url'),
        startDate: text('start_date').notNull(),
        endDate: text('end_date'),
        startTime: text('start_time'),
        endTime: text('end_time'),
        isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
        orderIndex: integer('order_index').notNull().default(0),
        color: text('color').notNull().default('#1ae784'),
        titleFont: text('title_font'),
        titleSize: text('title_size'),
        titleColor: text('title_color'),
        textColor: text('text_color'),
        overlayOpacity: real('overlay_opacity'),
        showDateBadge: integer('show_date_badge', { mode: 'boolean' }).notNull().default(true),
        location: text('location'),
        scheduleTimes: text('schedule_times', { mode: 'json' }),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text('updated_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => ({
        // mirrors: idx_events_calendar
        calendarIdx: index('idx_events_calendar').on(
            table.isActive,
            table.startDate,
            table.orderIndex,
        ),
    }),
);

export type EventRow = typeof events.$inferSelect;
export type InsertEventRow = typeof events.$inferInsert;

// ─── guests ──────────────────────────────────────────────────────────────────
// guest_status enum → text.
// appearance_at → text (ISO string).
// photo_asset_id / video_asset_id FK → ON DELETE SET NULL.

export const guests = sqliteTable(
    'guests',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => crypto.randomUUID()),
        name: text('name').notNull(),
        role: text('role'),
        company: text('company'),
        host: text('host'),
        program: text('program'),
        category: text('category').notNull().default('markets'),
        appearanceAt: text('appearance_at'),
        photoUrl: text('photo_url'),
        photoAssetId: text('photo_asset_id').references(() => mediaAssets.id, {
            onDelete: 'set null',
        }),
        videoUrl: text('video_url'),
        videoAssetId: text('video_asset_id').references(() => mediaAssets.id, {
            onDelete: 'set null',
        }),
        color: text('color').notNull().default('#f7931a'),
        sortOrder: integer('sort_order').notNull().default(0),
        status: text('status').notNull().default('ready'),
        metadata: text('metadata', { mode: 'json' })
            .notNull()
            .$defaultFn(() => ({})),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text('updated_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => ({
        // mirrors: guests_status_appearance_idx
        statusAppearanceIdx: index('guests_status_appearance_idx').on(
            table.status,
            table.appearanceAt,
            table.sortOrder,
        ),
        // mirrors: guests_category_idx
        categoryIdx: index('guests_category_idx').on(table.category),
        // mirrors: guests_photo_asset_idx
        photoAssetIdx: index('guests_photo_asset_idx').on(table.photoAssetId),
        // mirrors: guests_video_asset_idx
        videoAssetIdx: index('guests_video_asset_idx').on(table.videoAssetId),
    }),
);

export type GuestRow = typeof guests.$inferSelect;
export type InsertGuestRow = typeof guests.$inferInsert;

// ─── Re-export sql helper so callers can do `import { sql } from '@/lib/db/schema'` ─
export { sql };
