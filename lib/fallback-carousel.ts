import { createServiceClient } from "./supabase/server"

import type { ScheduleBundle, SlideAsset } from "./types"

export type FallbackCarouselCard = {
  slideId: string
  durationSeconds: number
}

export type FallbackCarousel = {
  enabled: boolean
  cards: FallbackCarouselCard[]
  updatedAt: string
}

export type FallbackCarouselSelection = {
  slide: SlideAsset
  card: FallbackCarouselCard
  index: number
  elapsedSeconds: number
  totalDurationSeconds: number
  carouselUpdatedAt: string
}

export async function getGlobalFallbackCarousel(): Promise<FallbackCarousel | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("integration_settings")
    .select("public_config, updated_at")
    .eq("provider", "fallback_carousel")
    .maybeSingle()
  return parseFallbackCarousel(data?.public_config, data?.updated_at)
}

export function selectFallbackCarouselSlide(
  carousel: FallbackCarousel | null,
  bundle: Pick<ScheduleBundle, "slideAssets">,
  serverSeconds: number
): FallbackCarouselSelection | null {
  if (!carousel?.enabled || !carousel.cards.length) return null
  const slideById = new Map(
    bundle.slideAssets.filter((slide) => slide.status === "ready").map((slide) => [slide.id, slide])
  )
  const cards = carousel.cards.filter((card) => slideById.has(card.slideId))
  if (!cards.length) return null
  const totalDurationSeconds = cards.reduce((total, card) => total + card.durationSeconds, 0)
  if (totalDurationSeconds <= 0) return null

  const loopSecond = Math.max(0, Math.floor(serverSeconds)) % totalDurationSeconds
  let cursor = 0
  for (const [index, card] of cards.entries()) {
    const nextCursor = cursor + card.durationSeconds
    if (loopSecond < nextCursor) {
      const slide = slideById.get(card.slideId)
      if (!slide) return null
      return {
        slide,
        card,
        index,
        elapsedSeconds: loopSecond - cursor,
        totalDurationSeconds,
        carouselUpdatedAt: carousel.updatedAt
      }
    }
    cursor = nextCursor
  }
  return null
}

export function parseFallbackCarousel(
  value: unknown,
  updatedAt: unknown = null
): FallbackCarousel | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const rawCards = Array.isArray(record.cards) ? record.cards : []
  const cards = rawCards
    .map((card) => parseFallbackCarouselCard(card))
    .filter((card): card is FallbackCarouselCard => Boolean(card))
  if (!cards.length) return null
  return {
    enabled: record.enabled !== false,
    cards,
    updatedAt: typeof updatedAt === "string" ? updatedAt : new Date(0).toISOString()
  }
}

function parseFallbackCarouselCard(value: unknown): FallbackCarouselCard | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const slideId = typeof record.slideId === "string" ? record.slideId : ""
  const durationSeconds = Math.max(1, Math.round(Number(record.durationSeconds || 0)))
  return slideId ? { slideId, durationSeconds } : null
}
