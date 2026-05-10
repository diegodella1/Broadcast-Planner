"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { FormHeader } from "@/components/ui"

type MediaMetadata = {
  kind: "video" | "image" | "audio" | "unknown"
  durationSeconds: string
  width: string
  height: string
  message: string
}

export function MediaUploadForm({
  action,
  title = "Upload media",
  detail = "Store videos, images or MP3 files with browser-checked metadata.",
  submitLabel = "Upload",
  returnTo,
  includeAudio = true,
  scheduleDate
}: {
  action: string
  title?: string
  detail?: string
  submitLabel?: string
  returnTo?: string
  includeAudio?: boolean
  scheduleDate?: string
}) {
  const [metadata, setMetadata] = useState<MediaMetadata>({
    kind: "unknown",
    durationSeconds: "",
    width: "",
    height: "",
    message: "No file selected"
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

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    revokeCurrentUrl()
    setMetadata({
      kind: "unknown",
      durationSeconds: "",
      width: "",
      height: "",
      message: "No file selected"
    })
    setManualDuration("")
    if (!file) return

    const objectUrl = URL.createObjectURL(file)
    objectUrlRef.current = objectUrl

    if (file.type.startsWith("image/")) {
      const image = new Image()
      image.onload = () => {
        setMetadata({
          kind: "image",
          durationSeconds: "",
          width: String(image.naturalWidth || ""),
          height: String(image.naturalHeight || ""),
          message: `${image.naturalWidth}x${image.naturalHeight} image. Default is 25 seconds.`
        })
        setManualDuration((current) => current || "25")
      }
      image.onerror = () =>
        setMetadata({
          kind: "image",
          durationSeconds: "",
          width: "",
          height: "",
          message: "Image details unreadable"
        })
      image.src = objectUrl
      return
    }

    if (file.type.startsWith("audio/")) {
      const audio = document.createElement("audio")
      audio.preload = "metadata"
      audio.onloadedmetadata = () => {
        const duration = Math.ceil(audio.duration || 0)
        setMetadata({
          kind: "audio",
          durationSeconds: duration ? String(duration) : "",
          width: "",
          height: "",
          message: duration ? `Detected ${duration}s audio.` : "Audio duration unreadable"
        })
      }
      audio.onerror = () =>
        setMetadata({
          kind: "audio",
          durationSeconds: "",
          width: "",
          height: "",
          message: "Audio duration unreadable"
        })
      audio.src = objectUrl
      return
    }

    const video = document.createElement("video")
    video.preload = "metadata"
    video.onloadedmetadata = () => {
      const duration = Math.ceil(video.duration || 0)
      setMetadata({
        kind: "video",
        durationSeconds: duration ? String(duration) : "",
        width: video.videoWidth ? String(video.videoWidth) : "",
        height: video.videoHeight ? String(video.videoHeight) : "",
        message: duration
          ? `Detected ${duration}s video (${video.videoWidth}x${video.videoHeight}).`
          : "Video duration unreadable"
      })
    }
    video.onerror = () =>
      setMetadata({
        kind: "video",
        durationSeconds: "",
        width: "",
        height: "",
        message: "Video duration unreadable"
      })
    video.src = objectUrl
  }

  return (
    <form action={action} method="post" encType="multipart/form-data" className="surface-panel p-4">
      <FormHeader title={title} detail={detail} />
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      {scheduleDate ? <input type="hidden" name="date" value={scheduleDate} /> : null}
      <input type="hidden" name="detected_duration_seconds" value={metadata.durationSeconds} />
      <input type="hidden" name="detected_width" value={metadata.width} />
      <input type="hidden" name="detected_height" value={metadata.height} />
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_170px_140px_120px]">
        <input
          name="title"
          required
          placeholder="Media title"
          className="border border-line px-3 py-2 text-sm"
        />
        <select name="asset_type" className="border border-line px-3 py-2 text-sm">
          <option value="video">Video</option>
          <option value="ad">Ad</option>
          <option value="promo">Promo</option>
          <option value="fallback">Fallback</option>
          <option value="image">Image</option>
          {includeAudio ? <option value="music">Music</option> : null}
        </select>
        <select name="orientation" className="border border-line px-3 py-2 text-sm">
          <option value="auto">Auto</option>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical blur</option>
        </select>
        <input
          name="duration_seconds"
          type="number"
          min="0"
          placeholder="Auto"
          value={manualDuration}
          onChange={(event) => setManualDuration(event.target.value)}
          className="border border-line px-3 py-2 text-sm"
        />
        {scheduleDate ? (
          <input
            name="start_time"
            required
            defaultValue="00:00:00"
            className="border border-line px-3 py-2 text-sm"
          />
        ) : null}
        <input
          name="media_file"
          required
          type="file"
          accept={accept}
          onChange={onFileChange}
          className="border border-line bg-surface px-3 py-2 text-sm lg:col-span-2"
        />
        <div className="rounded-md border border-line bg-panel-soft px-3 py-2 text-xs leading-5 text-muted">
          {metadata.message}
          {metadata.durationSeconds
            ? ` Server will use ${metadata.durationSeconds}s if seconds is blank or 0.`
            : ""}
        </div>
        <button className="btn-primary">{submitLabel}</button>
      </div>
    </form>
  )
}
