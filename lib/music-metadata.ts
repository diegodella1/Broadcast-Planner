export type MusicMetadataInput = {
  music_title?: unknown
  artist?: unknown
  album?: unknown
  year?: unknown
  track?: unknown
  genre?: unknown
}

export type MusicMetadata = {
  music_title?: string
  artist?: string
  album?: string
  year?: string
  track?: string
  genre?: string
}

const ALLOWED_KEYS = ["music_title", "artist", "album", "year", "track", "genre"] as const

export function sanitizeMusicMetadata(input: unknown): MusicMetadata {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const source = input as MusicMetadataInput
  const metadata: MusicMetadata = {}
  for (const key of ALLOWED_KEYS) {
    const value = sanitizeText(source[key])
    if (value) metadata[key] = value
  }
  return metadata
}

export function parseMusicMetadataJson(value: string | null | undefined): MusicMetadata {
  if (!value) return {}
  try {
    return sanitizeMusicMetadata(JSON.parse(value))
  } catch {
    return {}
  }
}

function sanitizeText(value: unknown) {
  if (typeof value !== "string") return ""
  return value.replace(/\s+/g, " ").trim().slice(0, 200)
}
