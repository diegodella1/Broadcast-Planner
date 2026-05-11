import type { ScheduleBundle } from "./types"

const now = new Date().toISOString()

export const mockSchedule: ScheduleBundle = {
  day: {
    id: "day-today",
    airDate: new Date().toISOString().slice(0, 10),
    timezone: "America/Los_Angeles",
    status: "active",
    title: "Roxom Daily",
    notes: "Seed fallback schedule",
    fallbackAssetId: "asset-fallback",
    createdAt: now,
    updatedAt: now
  },
  mediaAssets: [
    {
      id: "asset-vimeo-demo",
      title: "Vimeo Program Placeholder",
      sourceType: "vimeo",
      mediaKind: "video",
      assetType: "video",
      url: "https://vimeo.com/76979871",
      thumbnailUrl: null,
      durationSeconds: 7200,
      status: "ready",
      lifecycleState: "reviewed",
      vimeoId: "76979871",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "asset-sponsor-image",
      title: "Sponsor Plate",
      sourceType: "remote_image",
      mediaKind: "image",
      assetType: "ad",
      url: "https://images.unsplash.com/photo-1639322537504-6427a16b0a28",
      thumbnailUrl: null,
      durationSeconds: 30,
      status: "ready",
      lifecycleState: "reviewed",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "asset-fallback",
      title: "Roxom Fallback Slate",
      sourceType: "remote_image",
      mediaKind: "image",
      assetType: "fallback",
      url: null,
      thumbnailUrl: null,
      durationSeconds: null,
      status: "ready",
      lifecycleState: "reviewed",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "asset-reuters-live",
      title: "Reuters Live Feed",
      sourceType: "reuters",
      mediaKind: "video",
      assetType: "video",
      url: "https://example.com/reuters/live",
      thumbnailUrl: null,
      durationSeconds: null,
      status: "ready",
      lifecycleState: "reviewed",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "asset-music-bed",
      title: "Background Music Bed",
      sourceType: "supabase_audio",
      mediaKind: "audio",
      assetType: "music",
      url: "https://example.com/music.mp3",
      thumbnailUrl: null,
      durationSeconds: 180,
      status: "ready",
      lifecycleState: "reviewed",
      metadata: { playlist_order: 1 },
      createdAt: now,
      updatedAt: now
    }
  ],
  slideAssets: [
    {
      id: "slide-market-open",
      title: "Market Open",
      slideType: "html",
      htmlContent: "<strong>Market Open</strong><span>Daily agenda</span>",
      defaultDurationSeconds: 30,
      status: "ready",
      createdAt: now,
      updatedAt: now
    }
  ],
  blocks: [
    {
      id: "block-main",
      programDayId: "day-today",
      title: "Main program",
      blockType: "video",
      category: "mercados",
      assetId: "asset-vimeo-demo",
      startTime: "00:00:00",
      startTimeSeconds: 0,
      durationSeconds: 7200,
      status: "active",
      hideOverlays: false,
      fallbackAssetId: "asset-fallback",
      createdAt: now,
      updatedAt: now
    },
    {
      id: "block-ad",
      programDayId: "day-today",
      title: "Sponsor 30s",
      blockType: "ad",
      category: "broadcast",
      assetId: "asset-sponsor-image",
      startTime: "00:15:00",
      startTimeSeconds: 900,
      durationSeconds: 30,
      status: "ready",
      hideOverlays: true,
      fallbackAssetId: "asset-fallback",
      createdAt: now,
      updatedAt: now
    }
  ],
  layers: [
    {
      id: "layer-title",
      programBlockId: "block-main",
      title: "Title slide",
      layerType: "slide",
      slideId: "slide-market-open",
      startTimeSeconds: 120,
      durationSeconds: 30,
      zIndex: 10,
      position: "lower_third",
      enabled: true,
      locked: false,
      createdAt: now,
      updatedAt: now
    }
  ]
}
