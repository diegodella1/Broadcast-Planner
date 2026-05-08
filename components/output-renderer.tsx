"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import type { ActiveSchedule, MediaAsset, ScheduledLayer, SlideAsset } from "@/lib/types"
import { findActiveSchedule } from "@/lib/scheduler"
import type { ScheduleBundle } from "@/lib/types"
import { formatTimecode } from "@/lib/time"

type MediaState = "idle" | "loading" | "playing" | "waiting" | "stalled" | "errored" | "ended" | "fallback"

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
  const [mediaState, setMediaState] = useState<{
    assetId: string | null
    state: MediaState
    lastError: string | null
  }>({ assetId: null, state: "idle", lastError: null })

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
  const activeAssetId = active.asset?.id ?? active.fallbackAsset?.id ?? null
  const mediaFailed = mediaState.assetId === active.asset?.id && ["stalled", "errored", "ended", "fallback"].includes(mediaState.state)
  const renderAsset = mediaFailed ? active.fallbackAsset : active.asset ?? active.fallbackAsset
  const renderSlide = active.slide
  const musicAssets = schedule.mediaAssets.filter((asset) => asset.assetType === "music" && asset.status === "ready" && asset.url)
  const playMusic = shouldPlayBackgroundMusic(active, renderAsset ?? null, renderSlide ?? null)

  useEffect(() => {
    setMediaState({ assetId: activeAssetId, state: activeAssetId ? "loading" : "idle", lastError: null })
  }, [active.block?.id, activeAssetId])

  const updateMediaState = useCallback((state: MediaState, error?: string) => {
    setMediaState({
      assetId: activeAssetId,
      state,
      lastError: error ?? null
    })
  }, [activeAssetId])

  return (
    <main className="tv-output relative">
      <BaseContent active={active} asset={renderAsset ?? null} slide={renderSlide ?? null} onMediaState={updateMediaState} />
      {active.layers.map((layer) => (
        <Layer key={layer.id} layer={layer} schedule={schedule} />
      ))}
      <BackgroundMusic assets={musicAssets} enabled={playMusic} />
      {debug && <DebugPanel active={active} secondsOfDay={forcedBlockId ? secondsOfDay - initialSeconds : secondsOfDay} mediaState={mediaState} musicEnabled={playMusic} musicCount={musicAssets.length} />}
    </main>
  )
}

export function EmergencySlate({ reason }: { reason: string }) {
  return (
    <main className="tv-output relative">
      <Fallback asset={null} reason={reason} />
    </main>
  )
}

function BaseContent({
  active,
  asset,
  slide,
  onMediaState
}: {
  active: ActiveSchedule
  asset: MediaAsset | null
  slide: SlideAsset | null
  onMediaState: (state: MediaState, error?: string) => void
}) {
  if (!active.block) {
    return <Fallback asset={asset} reason={active.reason ?? "No active block"} />
  }
  if (slide) return <Slide slide={slide} fullscreen />
  if (!asset) return <Fallback asset={active.fallbackAsset ?? null} reason="Missing asset" />
  if (asset.mediaKind === "image") return <ImageAsset asset={asset} />
  if (asset.sourceType === "vimeo" && asset.vimeoId) return <VimeoEmbed asset={asset} />
  if (asset.sourceType === "reuters") return <ReutersPlayer asset={asset} onMediaState={onMediaState} />
  if (asset.sourceType === "remote_mp4" || asset.sourceType === "hls") {
    return <VideoAsset asset={asset} onMediaState={onMediaState} />
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

function VideoAsset({ asset, onMediaState }: { asset: MediaAsset; onMediaState: (state: MediaState, error?: string) => void }) {
  useEffect(() => {
    onMediaState("loading")
    const timeout = window.setTimeout(() => {
      onMediaState("fallback", "Media startup timeout")
    }, 8000)
    return () => window.clearTimeout(timeout)
  }, [asset.id, onMediaState])

  if (!asset.url) return <Fallback asset={null} reason={asset.title} />
  const presentation = asset.metadata?.presentation
  const vertical = presentation === "vertical_blur" || asset.metadata?.orientation === "vertical"
  const handlers = {
    onCanPlay: () => onMediaState("loading"),
    onPlaying: () => onMediaState("playing"),
    onWaiting: () => onMediaState("waiting"),
    onStalled: () => onMediaState("stalled", "Media stalled"),
    onError: () => onMediaState("errored", "Media playback error"),
    onEnded: () => onMediaState("ended", "Media ended")
  }
  if (!vertical) {
    return <video className="h-full w-full bg-black object-contain" src={asset.url} autoPlay muted playsInline controls={false} {...handlers} />
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
      <video className="relative z-10 mx-auto h-full max-w-full object-contain" src={asset.url} autoPlay muted playsInline controls={false} {...handlers} />
    </div>
  )
}

function ReutersPlayer({ asset, onMediaState }: { asset: MediaAsset; onMediaState: (state: MediaState, error?: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const src = asset.url ?? ""

  useEffect(() => {
    onMediaState("loading")
    const video = videoRef.current
    if (!video || !src) return

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src
      return
    }

    let cancelled = false
    let hlsInstance: { destroy: () => void } | null = null

    void import("hls.js").then((mod) => {
      if (cancelled || !video) return
      const Hls = mod.default
      if (!Hls.isSupported()) {
        video.src = src
        return
      }
      const instance = new Hls()
      hlsInstance = instance
      instance.loadSource(src)
      instance.attachMedia(video)
    }).catch(() => {
      onMediaState("errored", "Reuters HLS load error")
    })

    return () => {
      cancelled = true
      if (hlsInstance) hlsInstance.destroy()
    }
  }, [asset.id, onMediaState, src])

  if (!src) return <Fallback asset={null} reason={asset.title} />

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      controls={false}
      className="absolute inset-0 h-full w-full bg-black object-cover"
      aria-label={asset.title}
      onPlaying={() => onMediaState("playing")}
      onWaiting={() => onMediaState("waiting")}
      onStalled={() => onMediaState("stalled", "Reuters stream stalled")}
      onError={() => onMediaState("errored", "Reuters playback error")}
    />
  )
}

function BackgroundMusic({ assets, enabled }: { assets: MediaAsset[]; enabled: boolean }) {
  const [index, setIndex] = useState(0)
  const playlistKey = useMemo(() => assets.map((asset) => asset.id).join("|"), [assets])
  const current = assets[index % Math.max(assets.length, 1)]

  useEffect(() => {
    setIndex(0)
  }, [playlistKey])

  if (!enabled || !current?.url) return null

  return (
    <audio
      key={current.id}
      src={current.url}
      autoPlay
      controls={false}
      loop={assets.length === 1}
      onEnded={() => setIndex((value) => (value + 1) % assets.length)}
      onError={() => setIndex((value) => (value + 1) % assets.length)}
    />
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

function DebugPanel({
  active,
  secondsOfDay,
  mediaState,
  musicEnabled,
  musicCount
}: {
  active: ActiveSchedule
  secondsOfDay: number
  mediaState: { assetId: string | null; state: MediaState; lastError: string | null }
  musicEnabled: boolean
  musicCount: number
}) {
  return (
    <aside className="absolute right-4 top-4 z-[9999] w-96 rounded bg-black/80 p-4 font-mono text-xs text-white">
      <p>clock: {formatTimecode(secondsOfDay)}</p>
      <p>day: {active.day?.airDate ?? "none"}</p>
      <p>block: {active.block?.title ?? "fallback"}</p>
      <p>elapsed: {formatTimecode(active.elapsedInBlock)}</p>
      <p>asset: {active.asset?.title ?? active.fallbackAsset?.title ?? "none"}</p>
      <p>mediaState: {mediaState.state}</p>
      <p>mediaAssetId: {mediaState.assetId ?? "none"}</p>
      <p>fallback: {active.fallbackAsset?.title ?? "none"}</p>
      <p>music: {musicEnabled ? "on" : "off"} ({musicCount})</p>
      {mediaState.lastError && <p>mediaError: {mediaState.lastError}</p>}
      <p>layers: {active.layers.map((layer) => layer.title).join(", ") || "none"}</p>
      {active.reason && <p>reason: {active.reason}</p>}
    </aside>
  )
}

function shouldPlayBackgroundMusic(active: ActiveSchedule, renderAsset: MediaAsset | null, renderSlide: SlideAsset | null) {
  if (renderSlide) return true
  if (!active.block) return true
  if (!renderAsset) return true
  return renderAsset.mediaKind === "image"
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
