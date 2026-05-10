"use client"

import Image from "next/image"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { SlideTemplateRenderer } from "@/components/slides/index"
import { findActiveSchedule } from "@/lib/scheduler"
import { formatTimecode } from "@/lib/time"

import type { SlideTemplateId } from "@/lib/slides/registry"
import type { ActiveSchedule, MediaAsset, ScheduledLayer, SlideAsset } from "@/lib/types"
import type { ScheduleBundle } from "@/lib/types"

type MediaState =
  | "idle"
  | "loading"
  | "playing"
  | "waiting"
  | "stalled"
  | "errored"
  | "ended"
  | "fallback"

type MarketItem = {
  symbol: string
  label: string
  value: string
  change: string
  changePercent: string
  updatedAt: string
}

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
  const [liveSchedule, setLiveSchedule] = useState(initialSchedule)
  const [secondsOfDay, setSecondsOfDay] = useState(initialSeconds)
  const clockRef = useRef({ startedAt: 0, initialSeconds })
  const [mediaState, setMediaState] = useState<{
    assetId: string | null
    state: MediaState
    lastError: string | null
  }>({ assetId: null, state: "idle", lastError: null })

  useEffect(() => {
    clockRef.current = { startedAt: Date.now(), initialSeconds }
  }, [initialSeconds])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - clockRef.current.startedAt) / 1000)
      setSecondsOfDay(clockRef.current.initialSeconds + elapsedSeconds)
    }, 250)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (forcedBlockId) return
    let cancelled = false
    const refresh = async () => {
      try {
        const response = await fetch("/api/playout/schedule", { cache: "no-store" })
        if (!response.ok) return
        const payload = (await response.json()) as {
          schedule: ScheduleBundle
          secondsOfDay: number
        }
        if (cancelled) return
        setLiveSchedule(payload.schedule)
        clockRef.current = { startedAt: Date.now(), initialSeconds: payload.secondsOfDay }
        setSecondsOfDay(payload.secondsOfDay)
      } catch {
        // Keep the last known schedule on transient network failures.
      }
    }
    const timer = window.setInterval(refresh, 1000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [forcedBlockId])

  const schedule = useMemo(() => {
    if (!forcedBlockId) return liveSchedule
    const block = liveSchedule.blocks.find((item) => item.id === forcedBlockId)
    if (!block) return liveSchedule
    return {
      ...liveSchedule,
      blocks: [{ ...block, startTimeSeconds: 0, status: "active" as const }]
    }
  }, [forcedBlockId, liveSchedule])

  const active = findActiveSchedule(
    schedule,
    forcedBlockId ? secondsOfDay - initialSeconds : secondsOfDay
  )
  const activeAssetId = active.asset?.id ?? active.fallbackAsset?.id ?? null
  const currentMediaState: {
    assetId: string | null
    state: MediaState
    lastError: string | null
  } =
    mediaState.assetId === activeAssetId
      ? mediaState
      : { assetId: activeAssetId, state: activeAssetId ? "loading" : "idle", lastError: null }
  const mediaFailed =
    currentMediaState.assetId === active.asset?.id &&
    ["stalled", "errored", "ended", "fallback"].includes(currentMediaState.state)
  const renderAsset = mediaFailed ? active.fallbackAsset : (active.asset ?? active.fallbackAsset)
  const renderSlide = active.slide
  const musicAssets = schedule.mediaAssets
    .filter((asset) => asset.assetType === "music" && asset.status === "ready" && asset.url)
    .sort((a, b) => playlistOrder(a) - playlistOrder(b) || a.title.localeCompare(b.title))
  const playMusic = shouldPlayBackgroundMusic(active, renderAsset ?? null, renderSlide ?? null)

  const updateMediaState = useCallback(
    (state: MediaState, error?: string) => {
      setMediaState({
        assetId: activeAssetId,
        state,
        lastError: error ?? null
      })
    },
    [activeAssetId]
  )

  return (
    <main className="tv-output relative">
      <BaseContent
        active={active}
        asset={renderAsset ?? null}
        slide={renderSlide ?? null}
        onMediaState={updateMediaState}
      />
      {active.layers.map((layer) => (
        <Layer key={layer.id} layer={layer} schedule={schedule} />
      ))}
      <BackgroundMusic assets={musicAssets} enabled={playMusic} />
      {debug && (
        <DebugPanel
          active={active}
          secondsOfDay={forcedBlockId ? secondsOfDay - initialSeconds : secondsOfDay}
          mediaState={currentMediaState}
          musicEnabled={playMusic}
          musicCount={musicAssets.length}
        />
      )}
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
  if (asset.sourceType === "vimeo" && asset.vimeoId) {
    return <VimeoHlsPlayer asset={asset} onMediaState={onMediaState} />
  }
  if (asset.sourceType === "reuters")
    return <ReutersPlayer asset={asset} onMediaState={onMediaState} />
  if (asset.sourceType === "rtmp") return <RtmpNotice asset={asset} />
  if (asset.sourceType === "remote_mp4" || asset.sourceType === "hls") {
    return <VideoAsset asset={asset} onMediaState={onMediaState} />
  }
  return <Fallback asset={active.fallbackAsset ?? null} reason="Unsupported asset" />
}

function Layer({ layer, schedule }: { layer: ScheduledLayer; schedule: ScheduleBundle }) {
  const asset = layer.assetId
    ? schedule.mediaAssets.find((item) => item.id === layer.assetId)
    : null
  const slide = layer.slideId
    ? schedule.slideAssets.find((item) => item.id === layer.slideId)
    : null
  const position = positionClass(layer.position)
  return (
    <div className={`absolute ${position}`} style={{ zIndex: layer.zIndex }}>
      {slide ? (
        <Slide slide={slide} />
      ) : asset?.mediaKind === "image" ? (
        <ImageAsset asset={asset} contained />
      ) : null}
    </div>
  )
}

function VimeoHlsPlayer({
  asset,
  onMediaState
}: {
  asset: MediaAsset
  onMediaState: (state: MediaState, error?: string) => void
}) {
  const [playback, setPlayback] = useState<{
    assetId: string
    hlsUrl: string
    title: string
    durationSeconds: number | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    onMediaState("loading")
    fetch(apiPath(`/api/vimeo/playback/${asset.id}`), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? `Vimeo playback returned ${response.status}`)
        }
        return response.json() as Promise<{
          hlsUrl?: string
          title?: string
          durationSeconds?: number | null
        }>
      })
      .then((payload) => {
        if (cancelled) return
        if (!payload.hlsUrl) throw new Error("Vimeo playback URL unavailable")
        setPlayback({
          assetId: asset.id,
          hlsUrl: payload.hlsUrl,
          title: payload.title ?? asset.title,
          durationSeconds: payload.durationSeconds ?? asset.durationSeconds ?? null
        })
      })
      .catch((error) => {
        if (cancelled) return
        onMediaState("fallback", error instanceof Error ? error.message : "Vimeo playback failed")
      })
    return () => {
      cancelled = true
    }
  }, [asset.id, asset.durationSeconds, asset.title, onMediaState])

  if (!playback || playback.assetId !== asset.id) {
    return <Fallback asset={null} reason="Loading Vimeo stream" />
  }

  return (
    <VideoAsset
      asset={{
        ...asset,
        sourceType: "hls",
        url: playback.hlsUrl,
        title: playback.title,
        durationSeconds: playback.durationSeconds
      }}
      onMediaState={onMediaState}
    />
  )
}

function ImageAsset({ asset, contained = false }: { asset: MediaAsset; contained?: boolean }) {
  if (!asset.url) return <Fallback asset={null} reason={asset.title} />
  return (
    <div
      className={
        contained ? "relative h-80 w-[36rem] max-w-full rounded bg-black" : "relative h-full w-full"
      }
    >
      <Image
        alt={asset.title}
        className={contained ? "object-contain" : "object-cover"}
        src={asset.url}
        fill
        sizes={contained ? "36rem" : "100vw"}
      />
    </div>
  )
}

function VideoAsset({
  asset,
  onMediaState
}: {
  asset: MediaAsset
  onMediaState: (state: MediaState, error?: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const startupTimeoutRef = useRef<number | null>(null)
  const src = asset.url ?? ""

  const clearStartupTimeout = useCallback(() => {
    if (startupTimeoutRef.current === null) return
    window.clearTimeout(startupTimeoutRef.current)
    startupTimeoutRef.current = null
  }, [])

  useEffect(() => {
    onMediaState("loading")
    clearStartupTimeout()
    startupTimeoutRef.current = window.setTimeout(() => {
      onMediaState("fallback", "Media startup timeout")
    }, 8000)
    return clearStartupTimeout
  }, [asset.id, clearStartupTimeout, onMediaState])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src || asset.sourceType !== "hls") return
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src
      return
    }

    let cancelled = false
    let hlsInstance: { destroy: () => void } | null = null
    void import("hls.js")
      .then((mod) => {
        if (cancelled || !video) return
        const Hls = mod.default
        if (!Hls.isSupported()) {
          video.src = src
          return
        }
        const instance = new Hls({ lowLatencyMode: true })
        hlsInstance = instance
        instance.loadSource(src)
        instance.attachMedia(video)
      })
      .catch(() => onMediaState("errored", "HLS load error"))

    return () => {
      cancelled = true
      hlsInstance?.destroy()
    }
  }, [asset.id, asset.sourceType, onMediaState, src])

  if (!src) return <Fallback asset={null} reason={asset.title} />
  const presentation = asset.metadata?.presentation
  const vertical = presentation === "vertical_blur" || asset.metadata?.orientation === "vertical"
  const handlers = {
    onCanPlay: () => onMediaState("loading"),
    onLoadedData: () => {
      const playResult = videoRef.current?.play()
      playResult?.catch(() => onMediaState("fallback", "Autoplay blocked or media failed"))
    },
    onPlaying: () => {
      clearStartupTimeout()
      onMediaState("playing")
    },
    onWaiting: () => onMediaState("waiting"),
    onStalled: () => {
      clearStartupTimeout()
      onMediaState("stalled", "Media stalled")
    },
    onError: () => {
      clearStartupTimeout()
      onMediaState("errored", "Media playback error")
    },
    onEnded: () => {
      clearStartupTimeout()
      onMediaState("ended", "Media ended")
    }
  }
  if (!vertical) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        ref={videoRef}
        className="h-full w-full bg-black object-contain"
        src={asset.sourceType === "hls" ? undefined : src}
        autoPlay
        muted={false}
        playsInline
        controls={false}
        {...handlers}
      />
    )
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
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        className="relative z-10 mx-auto h-full max-w-full object-contain"
        src={asset.sourceType === "hls" ? undefined : src}
        autoPlay
        muted={false}
        playsInline
        controls={false}
        {...handlers}
      />
    </div>
  )
}

function apiPath(path: string) {
  if (typeof window === "undefined") return path
  const basePath = window.location.pathname.startsWith("/rtvtime/") ? "/rtvtime" : ""
  return `${basePath}${path}`
}

function RtmpNotice({ asset }: { asset: MediaAsset }) {
  return (
    <div className="grid h-full w-full place-items-center bg-black text-white">
      <div className="max-w-3xl px-10 text-center">
        <p className="text-5xl font-semibold">{asset.title}</p>
        <p className="mt-4 text-xl text-zinc-400">
          RTMP source registered. Browser output requires an RTMP to HLS/WebRTC bridge.
        </p>
      </div>
    </div>
  )
}

function ReutersPlayer({
  asset,
  onMediaState
}: {
  asset: MediaAsset
  onMediaState: (state: MediaState, error?: string) => void
}) {
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

    void import("hls.js")
      .then((mod) => {
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
      })
      .catch(() => {
        onMediaState("errored", "Reuters HLS load error")
      })

    return () => {
      cancelled = true
      if (hlsInstance) hlsInstance.destroy()
    }
  }, [asset.id, onMediaState, src])

  if (!src) return <Fallback asset={null} reason={asset.title} />

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={videoRef}
      autoPlay
      muted={false}
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
  const current = assets[index % Math.max(assets.length, 1)]

  if (!enabled || !current?.url) return null

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
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
  if (slide.templateId === "market") return <MarketSlide slide={slide} fullscreen={fullscreen} />
  const className = fullscreen
    ? "grid h-full w-full place-items-center bg-zinc-950 px-20 text-center text-white"
    : "rounded bg-zinc-950/92 px-8 py-5 text-white shadow-2xl"
  if (slide.slideType === "template") {
    if (!slide.templateId) {
      return (
        <div className={className}>
          <p className="text-2xl text-zinc-400">Loading template…</p>
        </div>
      )
    }
    const slideData = (slide as SlideAsset & { metadata?: { slideData?: unknown } }).metadata
      ?.slideData
    if (slideData === undefined || slideData === null) {
      return (
        <div className={className}>
          <p className="text-2xl text-zinc-400">Loading template…</p>
        </div>
      )
    }
    return (
      <SlideTemplateRenderer templateId={slide.templateId as SlideTemplateId} data={slideData} />
    )
  }
  if (slide.slideType === "image" && slide.imageUrl) {
    return (
      <div className={fullscreen ? "relative h-full w-full" : "relative h-80 w-[36rem] max-w-full"}>
        <Image
          alt={slide.title}
          className="object-contain"
          src={slide.imageUrl}
          fill
          sizes={fullscreen ? "100vw" : "36rem"}
        />
      </div>
    )
  }
  return (
    <div className={className}>
      <div>
        <div className="text-5xl font-semibold">{slide.title}</div>
        {slide.htmlContent && (
          <div className="mt-4 text-2xl" dangerouslySetInnerHTML={{ __html: slide.htmlContent }} />
        )}
        {slide.content && <p className="mt-4 text-2xl">{slide.content}</p>}
      </div>
    </div>
  )
}

function MarketSlide({ slide, fullscreen }: { slide: SlideAsset; fullscreen: boolean }) {
  const [markets, setMarkets] = useState<MarketItem[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch("/api/markets", { cache: "no-store" })
        if (!response.ok) return
        const payload = (await response.json()) as { markets: MarketItem[] }
        if (!cancelled) setMarkets(payload.markets)
      } catch {
        if (!cancelled) setMarkets([])
      }
    }
    void load()
    const timer = window.setInterval(load, 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return (
    <section
      className={
        fullscreen
          ? "h-full w-full bg-zinc-950 px-20 py-16 text-white"
          : "rounded bg-zinc-950/92 px-8 py-5 text-white shadow-2xl"
      }
    >
      <div className="flex items-end justify-between gap-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">Markets</p>
          <h1
            className={fullscreen ? "mt-3 text-6xl font-semibold" : "mt-2 text-3xl font-semibold"}
          >
            {slide.title}
          </h1>
          {slide.content ? <p className="mt-2 text-xl text-zinc-300">{slide.content}</p> : null}
        </div>
        <p className="text-right text-sm text-zinc-400">
          Updated{" "}
          {markets[0]?.updatedAt ? new Date(markets[0].updatedAt).toLocaleTimeString() : "--:--"}
        </p>
      </div>
      <div className={fullscreen ? "mt-12 grid grid-cols-2 gap-5" : "mt-6 grid gap-3"}>
        {markets.map((item) => {
          const positive = !item.change.trim().startsWith("-")
          return (
            <article
              key={item.symbol}
              className="rounded-md border border-white/10 bg-white/[0.06] p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-2xl font-semibold">{item.symbol}</p>
                  <p className="mt-1 text-sm text-zinc-400">{item.label}</p>
                </div>
                <p className="text-right text-2xl font-semibold">{item.value}</p>
              </div>
              <p
                className={
                  positive
                    ? "mt-5 text-xl font-semibold text-emerald-300"
                    : "mt-5 text-xl font-semibold text-red-300"
                }
              >
                {item.change} / {item.changePercent}
              </p>
            </article>
          )
        })}
      </div>
    </section>
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
      <p>
        music: {musicEnabled ? "on" : "off"} ({musicCount})
      </p>
      {mediaState.lastError && <p>mediaError: {mediaState.lastError}</p>}
      <p>layers: {active.layers.map((layer) => layer.title).join(", ") || "none"}</p>
      {active.reason && <p>reason: {active.reason}</p>}
    </aside>
  )
}

function shouldPlayBackgroundMusic(
  active: ActiveSchedule,
  renderAsset: MediaAsset | null,
  renderSlide: SlideAsset | null
) {
  if (renderSlide) return true
  if (!active.block) return true
  if (!renderAsset) return true
  return renderAsset.mediaKind === "image" || renderAsset.mediaKind === "graphic"
}

function playlistOrder(asset: MediaAsset) {
  const value = Number(asset.metadata?.playlist_order ?? 999)
  return Number.isFinite(value) ? value : 999
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
