import { parseTimecode } from "./time"

import type { MediaAsset, SlideAsset } from "./types"

type BuildInput = {
  mediaAssets: MediaAsset[]
  slideAssets: SlideAsset[]
  startTime: string
  totalHours: number
  programMinutes: number
  adBreakMinutes: number
  imageBumperSeconds: number
}

type BulkCardLoopInput = {
  cards: Array<{
    slideId: string
    title: string
    durationSeconds: number
  }>
  startTime: string
  endTime: string
}

export type GeneratedBlock = {
  title: string
  blockType: string
  assetId?: string | null
  slideId?: string | null
  startTime: string
  startTimeSeconds: number
  durationSeconds: number
}

export function buildBulkCardLoop(input: BulkCardLoopInput): GeneratedBlock[] {
  const startSeconds = parseTimecode(input.startTime)
  const endSeconds = parseTimecode(input.endTime)
  if (startSeconds < 0 || endSeconds > 86400 || startSeconds >= endSeconds) return []

  const cards = input.cards
    .map((card) => ({
      ...card,
      durationSeconds: Math.max(1, Math.round(Number(card.durationSeconds || 0)))
    }))
    .filter((card) => card.slideId && card.durationSeconds > 0)
  if (!cards.length) return []

  const blocks: GeneratedBlock[] = []
  let cursor = startSeconds
  let index = 0
  while (cursor < endSeconds) {
    const card = cards[index % cards.length]
    if (!card || cursor + card.durationSeconds > endSeconds) break
    blocks.push({
      title: card.title,
      blockType: "slide",
      assetId: null,
      slideId: card.slideId,
      startTime: formatTime(cursor),
      startTimeSeconds: cursor,
      durationSeconds: card.durationSeconds
    })
    cursor += card.durationSeconds
    index += 1
  }

  return blocks
}

export function buildLongTestSchedule(input: BuildInput): GeneratedBlock[] {
  const startSeconds = parseTimecode(input.startTime)
  const totalSeconds = Math.max(1, Math.round(input.totalHours * 3600))
  const endSeconds = Math.min(86400, startSeconds + totalSeconds)
  const programSeconds = Math.max(60, Math.round(input.programMinutes * 60))
  const adBreakSeconds = Math.max(0, Math.round(input.adBreakMinutes * 60))
  const imageBumperSeconds = Math.max(0, Math.round(input.imageBumperSeconds))

  const programs = input.mediaAssets.filter(
    (asset) =>
      asset.status === "ready" &&
      asset.mediaKind === "video" &&
      (asset.assetType === "video" || asset.assetType === "promo" || asset.assetType === "fallback")
  )
  const ads = input.mediaAssets.filter(
    (asset) => asset.status === "ready" && asset.assetType === "ad"
  )
  const images = input.mediaAssets.filter(
    (asset) => asset.status === "ready" && asset.mediaKind === "image"
  )
  const slides = input.slideAssets.filter((slide) => slide.status === "ready")

  const blocks: GeneratedBlock[] = []
  let cursor = startSeconds
  let programIndex = 0
  let adIndex = 0
  let imageIndex = 0
  let slideIndex = 0

  while (cursor < endSeconds) {
    const programAsset = programs[programIndex % Math.max(programs.length, 1)]
    const slide = !programAsset ? slides[slideIndex % Math.max(slides.length, 1)] : null
    const programDuration = clampDuration(programSeconds, cursor, endSeconds)
    blocks.push({
      title: programAsset
        ? `Program: ${programAsset.title}`
        : `Program: ${slide?.title ?? "block without asset"}`,
      blockType: programAsset ? normalizedBlockType(programAsset.assetType) : "slide",
      assetId: programAsset?.id ?? null,
      slideId: slide?.id ?? null,
      startTime: formatTime(cursor),
      startTimeSeconds: cursor,
      durationSeconds: programDuration
    })
    cursor += programDuration
    programIndex += 1
    if (slide) slideIndex += 1
    if (cursor >= endSeconds) break

    if (ads.length && adBreakSeconds > 0) {
      const adBreakEnd = Math.min(endSeconds, cursor + adBreakSeconds)
      while (cursor < adBreakEnd) {
        const ad = ads[adIndex % ads.length]
        if (!ad) break
        const adDuration = clampDuration(
          Math.min(ad.durationSeconds ?? 30, 300),
          cursor,
          adBreakEnd
        )
        blocks.push({
          title: `Ad: ${ad.title}`,
          blockType: "ad",
          assetId: ad.id,
          slideId: null,
          startTime: formatTime(cursor),
          startTimeSeconds: cursor,
          durationSeconds: adDuration
        })
        cursor += adDuration
        adIndex += 1
      }
      if (cursor >= endSeconds) break
    }

    if (images.length && imageBumperSeconds > 0 && cursor < endSeconds) {
      const image = images[imageIndex % images.length]
      if (!image) break
      const imageDuration = clampDuration(imageBumperSeconds, cursor, endSeconds)
      blocks.push({
        title: `Image: ${image.title}`,
        blockType: "image",
        assetId: image.id,
        slideId: null,
        startTime: formatTime(cursor),
        startTimeSeconds: cursor,
        durationSeconds: imageDuration
      })
      cursor += imageDuration
      imageIndex += 1
    }
  }

  return blocks
}

function clampDuration(duration: number, cursor: number, endSeconds: number) {
  return Math.max(1, Math.min(duration, endSeconds - cursor))
}

function normalizedBlockType(assetType: string) {
  if (assetType === "promo" || assetType === "fallback") return assetType
  return "video"
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":")
}
