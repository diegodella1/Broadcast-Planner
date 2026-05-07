"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import type { ActiveSchedule, MediaAsset, ScheduledLayer, SlideAsset } from "@/lib/types"
import { findActiveSchedule } from "@/lib/scheduler"
import type { ScheduleBundle } from "@/lib/types"
import { formatTimecode } from "@/lib/time"

export function OutputRenderer({
  initialSchedule,
  initialSeconds,
  debug = false,
  forcedBlockId
}: {
  initialSchedule: ScheduleBundle
  initialSeconds: number
  debug?: boolean
  forcedBlockId?: string
}) {
  const [secondsOfDay, setSecondsOfDay] = useState(initialSeconds)

  useEffect(() => {
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
      setSecondsOfDay(initialSeconds + elapsedSeconds)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [initialSeconds])

  const schedule = useMemo(() => {
    if (!forcedBlockId) return initialSchedule
    const block = initialSchedule.blocks.find((item) => item.id === forcedBlockId)
    if (!block) return initialSchedule
    return {
      ...initialSchedule,
      blocks: [{ ...block, startTimeSeconds: 0, status: "active" as const }]
    }
  }, [forcedBlockId, initialSchedule])

  const active = findActiveSchedule(schedule, forcedBlockId ? secondsOfDay - initialSeconds : secondsOfDay)
  const renderAsset = active.asset ?? active.fallbackAsset
  const renderSlide = active.slide

  return (
    <main className="tv-output relative">
      <BaseContent active={active} asset={renderAsset ?? null} slide={renderSlide ?? null} />
      {active.layers.map((layer) => (
        <Layer key={layer.id} layer={layer} schedule={schedule} />
      ))}
      {debug && <DebugPanel active={active} secondsOfDay={forcedBlockId ? secondsOfDay - initialSeconds : secondsOfDay} />}
    </main>
  )
}

function BaseContent({ active, asset, slide }: { active: ActiveSchedule; asset: MediaAsset | null; slide: SlideAsset | null }) {
  if (!active.block) {
    return <Fallback asset={asset} reason={active.reason ?? "No active block"} />
  }
  if (slide) return <Slide slide={slide} fullscreen />
  if (!asset) return <Fallback asset={active.fallbackAsset ?? null} reason="Missing asset" />
  if (asset.mediaKind === "image") return <ImageAsset asset={asset} />
  if (asset.sourceType === "vimeo" && asset.vimeoId) return <VimeoEmbed asset={asset} />
  if (asset.sourceType === "remote_mp4" || asset.sourceType === "hls") {
    return <VideoAsset asset={asset} />
  }
  return <Fallback asset={active.fallbackAsset ?? null} reason="Unsupported asset" />
}

function Layer({ layer, schedule }: { layer: ScheduledLayer; schedule: ScheduleBundle }) {
  const asset = layer.assetId ? schedule.mediaAssets.find((item) => item.id === layer.assetId) : null
  const slide = layer.slideId ? schedule.slideAssets.find((item) => item.id === layer.slideId) : null
  const position = positionClass(layer.position)
  return (
    <div className={`absolute ${position}`} style={{ zIndex: layer.zIndex }}>
      {slide ? <Slide slide={slide} /> : asset?.mediaKind === "image" ? <ImageAsset asset={asset} contained /> : null}
    </div>
  )
}

function VimeoEmbed({ asset }: { asset: MediaAsset }) {
  const src = `https://player.vimeo.com/video/${asset.vimeoId}?autoplay=1&muted=1&controls=0&background=0&dnt=1`
  return (
    <iframe
      title={asset.title}
      className="h-full w-full border-0"
      src={src}
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
    />
  )
}

function ImageAsset({ asset, contained = false }: { asset: MediaAsset; contained?: boolean }) {
  if (!asset.url) return <Fallback asset={null} reason={asset.title} />
  return (
    <div className={contained ? "relative h-80 w-[36rem] max-w-full rounded bg-black" : "relative h-full w-full"}>
      <Image alt={asset.title} className={contained ? "object-contain" : "object-cover"} src={asset.url} fill sizes={contained ? "36rem" : "100vw"} />
    </div>
  )
}

function VideoAsset({ asset }: { asset: MediaAsset }) {
  if (!asset.url) return <Fallback asset={null} reason={asset.title} />
  const presentation = asset.metadata?.presentation
  const vertical = presentation === "vertical_blur" || asset.metadata?.orientation === "vertical"
  if (!vertical) {
    return <video className="h-full w-full bg-black object-contain" src={asset.url} autoPlay muted playsInline controls={false} />
  }
  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {asset.thumbnailUrl ? (
        <Image
          aria-hidden="true"
          alt=""
          className="scale-110 object-cover opacity-55 blur-2xl"
          src={asset.thumbnailUrl}
          fill
          sizes="100vw"
        />
      ) : null}
      <div className="absolute inset-0 bg-black/35" />
      <video className="relative z-10 mx-auto h-full max-w-full object-contain" src={asset.url} autoPlay muted playsInline controls={false} />
    </div>
  )
}

function Slide({ slide, fullscreen = false }: { slide: SlideAsset; fullscreen?: boolean }) {
  const className = fullscreen
    ? "grid h-full w-full place-items-center bg-zinc-950 px-20 text-center text-white"
    : "rounded bg-zinc-950/92 px-8 py-5 text-white shadow-2xl"
  if (slide.slideType === "image" && slide.imageUrl) {
    return (
      <div className={fullscreen ? "relative h-full w-full" : "relative h-80 w-[36rem] max-w-full"}>
        <Image alt={slide.title} className="object-contain" src={slide.imageUrl} fill sizes={fullscreen ? "100vw" : "36rem"} />
      </div>
    )
  }
  return (
    <div className={className}>
      <div>
        <div className="text-5xl font-semibold">{slide.title}</div>
        {slide.htmlContent && <div className="mt-4 text-2xl" dangerouslySetInnerHTML={{ __html: slide.htmlContent }} />}
        {slide.content && <p className="mt-4 text-2xl">{slide.content}</p>}
      </div>
    </div>
  )
}

function Fallback({ asset, reason }: { asset: MediaAsset | null; reason: string }) {
  if (asset?.mediaKind === "image" && asset.url) return <ImageAsset asset={asset} />
  return (
    <div className="grid h-full w-full place-items-center bg-black text-white">
      <div className="text-center">
        <p className="text-5xl font-semibold">ROXOM TV</p>
        <p className="mt-4 text-xl text-zinc-400">{reason}</p>
      </div>
    </div>
  )
}

function DebugPanel({ active, secondsOfDay }: { active: ActiveSchedule; secondsOfDay: number }) {
  return (
    <aside className="absolute right-4 top-4 z-[9999] w-96 rounded bg-black/80 p-4 font-mono text-xs text-white">
      <p>clock: {formatTimecode(secondsOfDay)}</p>
      <p>day: {active.day?.airDate ?? "none"}</p>
      <p>block: {active.block?.title ?? "fallback"}</p>
      <p>elapsed: {formatTimecode(active.elapsedInBlock)}</p>
      <p>asset: {active.asset?.title ?? active.fallbackAsset?.title ?? "none"}</p>
      <p>layers: {active.layers.map((layer) => layer.title).join(", ") || "none"}</p>
      {active.reason && <p>reason: {active.reason}</p>}
    </aside>
  )
}

function positionClass(position: string) {
  switch (position) {
    case "lower_third":
      return "bottom-[8%] left-[6%]"
    case "top_right":
      return "right-[4%] top-[4%]"
    case "bottom_bar":
      return "bottom-0 left-0 w-full"
    case "sidebar":
      return "right-0 top-0 h-full w-96"
    case "fullscreen":
      return "inset-0"
    default:
      return "bottom-[8%] left-[6%]"
  }
}
