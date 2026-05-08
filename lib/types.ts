export type ProgramStatus = "draft" | "ready" | "active" | "archived"
export type AssetStatus = "draft" | "syncing" | "ready" | "failed" | "archived"
export type SourceType = "vimeo" | "supabase_image" | "remote_image" | "remote_mp4" | "hls" | "reuters"
export type MediaKind = "video" | "image" | "graphic"
export type BlockType = "video" | "image" | "slide" | "ad" | "promo" | "fallback"
export type LayerType = "overlay" | "image" | "slide" | "logo_bug" | "lower_third" | "promo"
export type Position = "fullscreen" | "lower_third" | "sidebar" | "top_right" | "bottom_bar" | "custom"

export type BlockCategory =
  | "mercados"
  | "earthcam"
  | "clima"
  | "calendario"
  | "trending"
  | "deuda"
  | "reuters"
  | "broadcast"

export const BLOCK_CATEGORIES: readonly BlockCategory[] = [
  "mercados", "earthcam", "clima", "calendario",
  "trending", "deuda", "reuters", "broadcast"
] as const

export type MediaAsset = {
  id: string
  title: string
  description?: string | null
  sourceType: SourceType
  mediaKind: MediaKind
  assetType: BlockType | "overlay"
  url?: string | null
  storageBucket?: string | null
  storagePath?: string | null
  thumbnailUrl?: string | null
  durationSeconds?: number | null
  status: AssetStatus
  vimeoId?: string | null
  vimeoUri?: string | null
  vimeoPrivacy?: string | null
  vimeoEmbedStatus?: string | null
  metadata?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export type SlideAsset = {
  id: string
  title: string
  slideType: "image" | "html" | "template" | "markdown"
  content?: string | null
  imageUrl?: string | null
  htmlContent?: string | null
  templateId?: string | null
  defaultDurationSeconds?: number | null
  status: "draft" | "ready" | "archived"
  createdAt: string
  updatedAt: string
}

export type ProgramDay = {
  id: string
  airDate: string
  timezone: string
  status: ProgramStatus
  title?: string | null
  notes?: string | null
  fallbackAssetId?: string | null
  createdAt: string
  updatedAt: string
}

export type ProgramBlock = {
  id: string
  programDayId: string
  title: string
  blockType: BlockType
  category: BlockCategory
  assetId?: string | null
  slideId?: string | null
  startTime: string
  startTimeSeconds: number
  durationSeconds: number
  status: ProgramStatus
  hideOverlays: boolean
  fallbackAssetId?: string | null
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export type ScheduledLayer = {
  id: string
  programBlockId: string
  title: string
  layerType: LayerType
  assetId?: string | null
  slideId?: string | null
  startTimeSeconds: number
  durationSeconds: number
  zIndex: number
  position: Position
  enabled: boolean
  locked: boolean
  createdAt: string
  updatedAt: string
}

export type ScheduleBundle = {
  day: ProgramDay | null
  blocks: ProgramBlock[]
  layers: ScheduledLayer[]
  mediaAssets: MediaAsset[]
  slideAssets: SlideAsset[]
}

export type ActiveSchedule = {
  day: ProgramDay | null
  block: ProgramBlock | null
  elapsedInBlock: number
  layers: ScheduledLayer[]
  asset?: MediaAsset | null
  slide?: SlideAsset | null
  fallbackAsset?: MediaAsset | null
  reason?: string
}
