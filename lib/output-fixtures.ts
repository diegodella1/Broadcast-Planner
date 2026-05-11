import type { ScheduleBundle } from "./types"

export function forcedBadMediaSchedule(): ScheduleBundle {
  const now = new Date().toISOString()
  return {
    day: {
      id: "fixture-day",
      airDate: "2099-01-01",
      timezone: "UTC",
      status: "active",
      title: "Forced bad media fixture",
      createdAt: now,
      updatedAt: now
    },
    blocks: [
      {
        id: "fixture-bad-media",
        programDayId: "fixture-day",
        title: "Forced bad media primary",
        blockType: "video",
        category: "broadcast",
        assetId: "fixture-primary-bad",
        startTime: "00:00:00",
        startTimeSeconds: 0,
        durationSeconds: 3600,
        status: "active",
        hideOverlays: false,
        fallbackAssetId: "fixture-fallback",
        createdAt: now,
        updatedAt: now
      }
    ],
    layers: [],
    mediaAssets: [
      {
        id: "fixture-primary-bad",
        title: "Broken primary media",
        sourceType: "remote_mp4",
        mediaKind: "video",
        assetType: "video",
        url: "https://example.invalid/rtv-broken-primary.mp4",
        durationSeconds: 3600,
        status: "ready",
        lifecycleState: "reviewed",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "fixture-fallback",
        title: "Fixture fallback slate",
        sourceType: "remote_image",
        mediaKind: "image",
        assetType: "fallback",
        url: null,
        durationSeconds: 3600,
        status: "ready",
        lifecycleState: "reviewed",
        createdAt: now,
        updatedAt: now
      }
    ],
    slideAssets: []
  }
}

export function outputFixturesEnabled() {
  return process.env.ALLOW_OUTPUT_FIXTURES === "true"
}
