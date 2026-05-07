insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-assets',
  'video-assets',
  true,
  524288000,
  array['video/mp4', 'video/webm', 'application/vnd.apple.mpegurl', 'application/x-mpegURL']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
