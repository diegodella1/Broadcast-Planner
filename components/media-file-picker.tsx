"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { MAX_SMALL_MEDIA_BYTES, formatUploadLimit } from "@/lib/media-upload-constants"

type MediaMetadata = {
  durationSeconds: string
  width: string
  height: string
  message: string
  status: "idle" | "checking" | "ready" | "error"
  fileName: string
  fileSize: string
  fileType: string
  previewUrl: string
  previewKind: "image" | "video" | "audio" | "none"
}

const MAX_SHORT_VIDEO_SECONDS = 5 * 60

export function MediaFilePicker({
  includeAudio = true,
  compact = false
}: {
  includeAudio?: boolean
  compact?: boolean
}) {
  const [metadata, setMetadata] = useState<MediaMetadata>({
    durationSeconds: "",
    width: "",
    height: "",
    message: "No file selected",
    status: "idle",
    fileName: "",
    fileSize: "",
    fileType: "",
    previewUrl: "",
    previewKind: "none"
  })
  const [manualDuration, setManualDuration] = useState("")
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  const accept = useMemo(
    () =>
      includeAudio
        ? "video/mp4,video/webm,image/png,image/jpeg,image/webp,image/gif,audio/mpeg,audio/mp3"
        : "video/mp4,video/webm,image/png,image/jpeg,image/webp,image/gif",
    [includeAudio]
  )

  function revokeCurrentUrl() {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = null
  }

  function reset(message = "No file selected") {
    setMetadata({
      durationSeconds: "",
      width: "",
      height: "",
      message,
      status: message === "No file selected" ? "idle" : "error",
      fileName: "",
      fileSize: "",
      fileType: "",
      previewUrl: "",
      previewKind: "none"
    })
    setManualDuration("")
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    revokeCurrentUrl()
    reset()
    if (!file) return
    if (file.size > MAX_SMALL_MEDIA_BYTES) {
      event.target.value = ""
      reset(
        `File is ${formatBytes(file.size)}. Browser uploads must be ${formatUploadLimit()} or less; use Vimeo or a remote URL for larger videos.`
      )
      return
    }

    const objectUrl = URL.createObjectURL(file)
    objectUrlRef.current = objectUrl
    const baseDetails = {
      fileName: file.name,
      fileSize: formatBytes(file.size),
      fileType: file.type || "unknown",
      previewUrl: objectUrl
    }
    setMetadata({
      durationSeconds: "",
      width: "",
      height: "",
      message: "Checking file metadata...",
      status: "checking",
      ...baseDetails,
      previewKind: file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("audio/")
          ? "audio"
          : file.type.startsWith("video/")
            ? "video"
            : "none"
    })

    if (file.type.startsWith("image/")) {
      const image = new Image()
      image.onload = () => {
        setMetadata({
          durationSeconds: "",
          width: String(image.naturalWidth || ""),
          height: String(image.naturalHeight || ""),
          message: `${image.naturalWidth}x${image.naturalHeight} image. Default is 25 seconds.`,
          status: "ready",
          ...baseDetails,
          previewKind: "image"
        })
        setManualDuration("25")
      }
      image.onerror = () => reset("Image details unreadable")
      image.src = objectUrl
      return
    }

    if (file.type.startsWith("audio/")) {
      const audio = document.createElement("audio")
      audio.preload = "metadata"
      audio.onloadedmetadata = () => {
        const duration = Math.ceil(audio.duration || 0)
        setMetadata({
          durationSeconds: duration ? String(duration) : "",
          width: "",
          height: "",
          message: duration ? `Detected ${duration}s audio.` : "Audio duration unreadable",
          status: duration ? "ready" : "error",
          ...baseDetails,
          previewKind: "audio"
        })
      }
      audio.onerror = () => reset("Audio duration unreadable")
      audio.src = objectUrl
      return
    }

    const video = document.createElement("video")
    video.preload = "metadata"
    video.onloadedmetadata = () => {
      const duration = Math.ceil(video.duration || 0)
      const isTooLong = duration > MAX_SHORT_VIDEO_SECONDS
      setMetadata({
        durationSeconds: duration ? String(duration) : "",
        width: video.videoWidth ? String(video.videoWidth) : "",
        height: video.videoHeight ? String(video.videoHeight) : "",
        message: isTooLong
          ? `Detected ${duration}s video. Short video uploads must be 5 minutes or less.`
          : duration
            ? `Detected ${duration}s video (${video.videoWidth}x${video.videoHeight}).`
            : "Video duration unreadable",
        status: duration && !isTooLong ? "ready" : "error",
        ...baseDetails,
        previewKind: "video"
      })
    }
    video.onerror = () => reset("Video duration unreadable")
    video.src = objectUrl
  }

  return (
    <>
      <input type="hidden" name="detected_duration_seconds" value={metadata.durationSeconds} />
      <input type="hidden" name="detected_width" value={metadata.width} />
      <input type="hidden" name="detected_height" value={metadata.height} />
      <label className="grid gap-1 text-xs font-semibold text-muted">
        On-air seconds
        <input
          name="duration_seconds"
          type="number"
          min="0"
          placeholder="Auto"
          value={manualDuration}
          onChange={(event) => setManualDuration(event.target.value)}
          className="border border-line px-3 py-2 text-sm font-normal text-ink"
        />
        <span className="text-[0.7rem] font-normal">
          Blank or 0 uses detected duration. Short video uploads max out at 5 minutes and{" "}
          {formatUploadLimit()}.
        </span>
      </label>
      <label
        className={[
          "grid gap-1 text-xs font-semibold text-muted",
          compact ? "" : "lg:col-span-2"
        ].join(" ")}
      >
        Media file
        <input
          name="media_file"
          required
          type="file"
          accept={accept}
          onChange={onFileChange}
          data-max-file-bytes={MAX_SMALL_MEDIA_BYTES}
          className="w-full min-w-0 border border-line bg-surface px-3 py-2 text-sm font-normal text-ink file:mr-3 file:rounded-md file:border-0 file:bg-panel-soft file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink"
        />
      </label>
      <div
        aria-live="polite"
        className={[
          "grid min-w-0 grid-cols-1 gap-3 rounded-md border px-3 py-3 text-xs leading-5",
          compact ? "" : "lg:col-span-4",
          metadata.status === "error"
            ? "border-danger-line bg-danger-soft text-danger-strong"
            : metadata.status === "ready"
              ? "border-success-line bg-success-soft text-success-strong"
              : "border-line bg-panel-soft text-muted"
        ].join(" ")}
      >
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
          <Preview metadata={metadata} />
          <div>
            <p className="font-semibold text-ink">{metadata.message}</p>
            {metadata.fileName ? (
              <p className="mt-1 text-muted">
                {metadata.fileName} · {metadata.fileSize} · {metadata.fileType}
              </p>
            ) : null}
            {metadata.durationSeconds ? (
              <p className="mt-1 text-muted">
                Auto duration: {metadata.durationSeconds}s. Override only when needed.
              </p>
            ) : null}
            {metadata.width && metadata.height ? (
              <p className="mt-1 text-muted">
                Dimensions: {metadata.width}x{metadata.height}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}

function Preview({ metadata }: { metadata: MediaMetadata }) {
  if (!metadata.previewUrl) {
    return (
      <div className="grid aspect-video place-items-center rounded-md border border-line bg-surface text-muted">
        Preview
      </div>
    )
  }
  if (metadata.previewKind === "image") {
    return (
      <img
        src={metadata.previewUrl}
        alt=""
        className="aspect-video w-full rounded-md border border-line object-cover"
      />
    )
  }
  if (metadata.previewKind === "video") {
    return (
      <video
        src={metadata.previewUrl}
        muted
        controls
        className="aspect-video w-full rounded-md border border-line object-cover"
      >
        <track kind="captions" label="No captions available" />
      </video>
    )
  }
  if (metadata.previewKind === "audio") {
    return (
      <div className="grid min-h-24 rounded-md border border-line bg-surface p-2">
        <audio src={metadata.previewUrl} controls className="w-full self-center">
          <track kind="captions" label="No captions available" />
        </audio>
      </div>
    )
  }
  return (
    <div className="grid aspect-video place-items-center rounded-md border border-line bg-surface text-muted">
      File
    </div>
  )
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}
