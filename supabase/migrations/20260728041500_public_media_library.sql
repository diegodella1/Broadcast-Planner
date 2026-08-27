alter type asset_status add value if not exists 'needs_review';

alter table media_assets
  add column if not exists canonical_url text,
  add column if not exists playback_kind text
    check (playback_kind in ('video_file', 'hls', 'embed', 'image', 'audio')),
  add column if not exists content_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists video_codec text,
  add column if not exists audio_codec text,
  add column if not exists bit_rate bigint,
  add column if not exists frame_rate numeric,
  add column if not exists quality_label text,
  add column if not exists etag text,
  add column if not exists last_modified text,
  add column if not exists metadata_status text not null default 'pending'
    check (metadata_status in ('pending', 'ready', 'partial', 'stale', 'failed')),
  add column if not exists metadata_checked_at timestamptz,
  add column if not exists metadata_failures integer not null default 0,
  add column if not exists metadata_error text;

alter table media_assets
  drop constraint if exists media_assets_playback_readiness_status_check;
alter table media_assets
  add constraint media_assets_playback_readiness_status_check
  check (playback_readiness_status in ('unchecked', 'ready', 'review', 'failed'));

update media_assets
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'legacy_provider', 'vimeo',
    'legacy_vimeo_id', vimeo_id,
    'legacy_vimeo_uri', vimeo_uri,
    'legacy_vimeo_privacy', vimeo_privacy,
    'legacy_vimeo_embed_status', vimeo_embed_status,
    'archived_at', now()
  ),
  status = 'archived',
  metadata_status = 'stale',
  playback_readiness_status = 'review'
where source_type::text = 'vimeo';

update media_assets
set
  playback_kind = case
    when source_type::text = 'hls' then 'hls'
    when source_type::text = 'remote_image' or media_kind::text = 'image' then 'image'
    when source_type::text = 'supabase_audio' or media_kind::text = 'audio' then 'audio'
    when source_type::text in ('remote_mp4', 'reuters') or media_kind::text = 'video' then 'video_file'
    else null
  end,
  metadata_status = case when status = 'ready' then 'ready' else metadata_status end;

alter type source_type rename to source_type_legacy;
create type source_type as enum ('uploaded', 'public_url', 'legacy_external');

alter table media_assets
  alter column source_type type source_type
  using (
    case
      when source_type::text = 'vimeo' then 'legacy_external'
      when source_type::text in ('supabase_image', 'supabase_audio') then 'uploaded'
      when source_type::text in ('remote_image', 'remote_mp4', 'hls', 'rtmp', 'reuters') then 'public_url'
      else source_type::text
    end
  )::source_type;

drop type source_type_legacy;

with ranked_urls as (
  select id, url, row_number() over (partition by url order by id) as position
  from media_assets
  where source_type = 'public_url' and url is not null
)
update media_assets
set canonical_url = ranked_urls.url
from ranked_urls
where media_assets.id = ranked_urls.id and ranked_urls.position = 1;

delete from integration_settings where provider = 'vimeo';

alter table media_assets
  drop column if exists vimeo_id,
  drop column if exists vimeo_uri,
  drop column if exists vimeo_privacy,
  drop column if exists vimeo_embed_status;

create unique index if not exists media_assets_canonical_url_unique
  on media_assets (canonical_url);
create index if not exists media_assets_metadata_refresh_idx
  on media_assets (source_type, status, metadata_checked_at);
