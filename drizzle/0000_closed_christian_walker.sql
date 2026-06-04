CREATE TABLE `admin_operators` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_operators_handle_unique` ON `admin_operators` (`handle`);--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`operator_id` text NOT NULL,
	`session_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`operator_id`) REFERENCES `admin_operators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_sessions_session_hash_unique` ON `admin_sessions` (`session_hash`);--> statement-breakpoint
CREATE INDEX `idx_admin_sessions_operator` ON `admin_sessions` (`operator_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `api_rate_limits` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`reset_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text DEFAULT 'system' NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`image_url` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`start_time` text,
	`end_time` text,
	`is_active` integer DEFAULT true NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT '#1ae784' NOT NULL,
	`title_font` text,
	`title_size` text,
	`title_color` text,
	`text_color` text,
	`overlay_opacity` real,
	`show_date_badge` integer DEFAULT true NOT NULL,
	`location` text,
	`schedule_times` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_calendar` ON `events` (`is_active`,`start_date`,`order_index`);--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`company` text,
	`host` text,
	`program` text,
	`category` text DEFAULT 'markets' NOT NULL,
	`appearance_at` text,
	`photo_url` text,
	`photo_asset_id` text,
	`video_url` text,
	`video_asset_id` text,
	`color` text DEFAULT '#f7931a' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`photo_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`video_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `guests_status_appearance_idx` ON `guests` (`status`,`appearance_at`,`sort_order`);--> statement-breakpoint
CREATE INDEX `guests_category_idx` ON `guests` (`category`);--> statement-breakpoint
CREATE INDEX `guests_photo_asset_idx` ON `guests` (`photo_asset_id`);--> statement-breakpoint
CREATE INDEX `guests_video_asset_idx` ON `guests` (`video_asset_id`);--> statement-breakpoint
CREATE TABLE `integration_settings` (
	`provider` text PRIMARY KEY NOT NULL,
	`public_config` text NOT NULL,
	`encrypted_secret` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_checked_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`source_type` text NOT NULL,
	`media_kind` text NOT NULL,
	`asset_type` text NOT NULL,
	`url` text,
	`storage_bucket` text,
	`storage_path` text,
	`thumbnail_url` text,
	`duration_seconds` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`vimeo_id` text,
	`vimeo_uri` text,
	`vimeo_privacy` text,
	`vimeo_embed_status` text,
	`metadata` text NOT NULL,
	`playback_readiness_status` text DEFAULT 'unchecked' NOT NULL,
	`playback_checked_at` text,
	`playback_error` text,
	`lifecycle_state` text DEFAULT 'reviewed' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_assets_vimeo_id_unique` ON `media_assets` (`vimeo_id`);--> statement-breakpoint
CREATE TABLE `operator_preferences` (
	`operator_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`operator_id`) REFERENCES `admin_operators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `operator_runbook_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`program_day_id` text NOT NULL,
	`section` text NOT NULL,
	`item_key` text NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`notes` text,
	`checked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`program_day_id`) REFERENCES `program_days`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operator_runbook_checks_day_section_item_uniq` ON `operator_runbook_checks` (`program_day_id`,`section`,`item_key`);--> statement-breakpoint
CREATE INDEX `idx_operator_runbook_checks_day` ON `operator_runbook_checks` (`program_day_id`,`section`,`item_key`);--> statement-breakpoint
CREATE TABLE `output_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`program_day_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`source_type` text NOT NULL,
	`block_id` text,
	`asset_id` text,
	`slide_id` text,
	`stream_url` text,
	`stream_protocol` text,
	`label` text,
	`expires_at` text,
	`metadata` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`program_day_id`) REFERENCES `program_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`block_id`) REFERENCES `program_blocks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`slide_id`) REFERENCES `slide_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `admin_operators`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `program_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`program_day_id` text NOT NULL,
	`title` text NOT NULL,
	`block_type` text NOT NULL,
	`category` text NOT NULL,
	`asset_id` text,
	`slide_id` text,
	`start_time` text NOT NULL,
	`start_time_seconds` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`hide_overlays` integer DEFAULT false NOT NULL,
	`fallback_asset_id` text,
	`notes` text,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`program_day_id`) REFERENCES `program_days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`slide_id`) REFERENCES `slide_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`fallback_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `program_days` (
	`id` text PRIMARY KEY NOT NULL,
	`air_date` text NOT NULL,
	`timezone` text DEFAULT 'America/Los_Angeles' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`title` text,
	`notes` text,
	`fallback_asset_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`fallback_asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `program_days_air_date_unique` ON `program_days` (`air_date`);--> statement-breakpoint
CREATE TABLE `scheduled_layers` (
	`id` text PRIMARY KEY NOT NULL,
	`program_block_id` text NOT NULL,
	`title` text NOT NULL,
	`layer_type` text NOT NULL,
	`asset_id` text,
	`slide_id` text,
	`start_time_seconds` integer DEFAULT 0 NOT NULL,
	`duration_seconds` integer NOT NULL,
	`z_index` integer DEFAULT 10 NOT NULL,
	`position` text DEFAULT 'lower_third' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`program_block_id`) REFERENCES `program_blocks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`slide_id`) REFERENCES `slide_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `slide_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slide_type` text NOT NULL,
	`content` text,
	`image_url` text,
	`html_content` text,
	`template_id` text,
	`default_duration_seconds` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`metadata` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
