export const MAX_SMALL_MEDIA_BYTES = 95 * 1024 * 1024
export const MAX_SHORT_VIDEO_SECONDS = 5 * 60
export const SMALL_MEDIA_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/mp3"
] as const

export function formatUploadLimit(bytes = MAX_SMALL_MEDIA_BYTES) {
  return `${Math.floor(bytes / 1024 / 1024)} MB`
}
