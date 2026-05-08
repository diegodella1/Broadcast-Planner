insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'small-media-assets',
  'small-media-assets',
  true,
  524288000,
  array['video/mp4', 'video/webm', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/mp3']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
