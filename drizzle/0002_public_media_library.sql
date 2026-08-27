ALTER TABLE `media_assets` ADD `canonical_url` text;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `playback_kind` text;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `content_type` text;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `file_size_bytes` integer;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `width` integer;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `height` integer;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `video_codec` text;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `audio_codec` text;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `bit_rate` integer;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `frame_rate` real;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `quality_label` text;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `etag` text;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `last_modified` text;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `metadata_status` text NOT NULL DEFAULT 'pending';
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `metadata_checked_at` text;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `metadata_failures` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `media_assets` ADD `metadata_error` text;
--> statement-breakpoint
UPDATE `media_assets`
SET
    `metadata` = json_set(
        COALESCE(`metadata`, '{}'),
        '$.legacy_provider', 'vimeo',
        '$.legacy_vimeo_id', `vimeo_id`,
        '$.legacy_vimeo_uri', `vimeo_uri`,
        '$.legacy_vimeo_privacy', `vimeo_privacy`,
        '$.legacy_vimeo_embed_status', `vimeo_embed_status`,
        '$.archived_at', CURRENT_TIMESTAMP
    ),
    `source_type` = 'legacy_external',
    `status` = 'archived',
    `metadata_status` = 'stale',
    `playback_readiness_status` = 'review'
WHERE `source_type` = 'vimeo';
--> statement-breakpoint
UPDATE `media_assets`
SET
    `source_type` = CASE
        WHEN `source_type` IN ('supabase_image', 'supabase_audio') THEN 'uploaded'
        WHEN `source_type` IN ('remote_image', 'remote_mp4', 'hls', 'rtmp', 'reuters') THEN 'public_url'
        ELSE `source_type`
    END,
    `playback_kind` = CASE
        WHEN `source_type` = 'hls' THEN 'hls'
        WHEN `source_type` = 'remote_image' OR `media_kind` = 'image' THEN 'image'
        WHEN `source_type` = 'supabase_audio' OR `media_kind` = 'audio' THEN 'audio'
        WHEN `source_type` IN ('remote_mp4', 'reuters') OR `media_kind` = 'video' THEN 'video_file'
        ELSE NULL
    END,
    `metadata_status` = CASE WHEN `status` = 'ready' THEN 'ready' ELSE 'pending' END
WHERE `source_type` <> 'legacy_external';
--> statement-breakpoint
UPDATE `media_assets`
SET `canonical_url` = `url`
WHERE
    `source_type` = 'public_url'
    AND `url` IS NOT NULL
    AND `id` = (
        SELECT MIN(`dedupe`.`id`)
        FROM `media_assets` AS `dedupe`
        WHERE `dedupe`.`url` = `media_assets`.`url`
    );
--> statement-breakpoint
DELETE FROM `integration_settings` WHERE `provider` = 'vimeo';
--> statement-breakpoint
DROP INDEX `media_assets_vimeo_id_unique`;
--> statement-breakpoint
ALTER TABLE `media_assets` DROP COLUMN `vimeo_id`;
--> statement-breakpoint
ALTER TABLE `media_assets` DROP COLUMN `vimeo_uri`;
--> statement-breakpoint
ALTER TABLE `media_assets` DROP COLUMN `vimeo_privacy`;
--> statement-breakpoint
ALTER TABLE `media_assets` DROP COLUMN `vimeo_embed_status`;
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_canonical_url_unique` ON `media_assets` (`canonical_url`);
--> statement-breakpoint
CREATE INDEX `media_assets_metadata_refresh_idx` ON `media_assets` (`source_type`, `status`, `metadata_checked_at`);
