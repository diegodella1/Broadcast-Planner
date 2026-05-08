/**
 * News-slide data fetcher.
 *
 * backgroundclima does not have a dedicated news API route — its NewsSlide is
 * driven by an admin-configured slide row. Until a real source is wired up
 * we expose a minimal fixture-mode controlled by env vars so operators can
 * preview the template without crashing.
 *
 * NEWS_SLIDE_IMAGE_URL  — image used for the Ken Burns background
 * NEWS_SLIDE_HEADLINE   — headline text
 * NEWS_SLIDE_DESCRIPTION (optional)
 * NEWS_SLIDE_SOURCE     (optional)
 * NEWS_SLIDE_DURATION_S (optional, default 12)
 */

import type { NewsSlideData } from "@/lib/slides/types"

const DEFAULT_DURATION_SECONDS = 12

export function getNewsSlideData(): NewsSlideData {
  const imageUrl = process.env.NEWS_SLIDE_IMAGE_URL ?? ""
  const headline = process.env.NEWS_SLIDE_HEADLINE ?? ""
  const description = process.env.NEWS_SLIDE_DESCRIPTION ?? null
  const source = process.env.NEWS_SLIDE_SOURCE ?? null
  const parsedDuration = Number.parseInt(process.env.NEWS_SLIDE_DURATION_S ?? "", 10)
  const durationSeconds =
    Number.isFinite(parsedDuration) && parsedDuration > 0
      ? parsedDuration
      : DEFAULT_DURATION_SECONDS

  if (!imageUrl) {
    console.warn(
      "[lib/slides/data/news.ts] NEWS_SLIDE_IMAGE_URL not set; returning empty news payload"
    )
  }

  return { imageUrl, headline, description, source, durationSeconds }
}
