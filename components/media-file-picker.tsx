"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type MediaMetadata = {
  durationSeconds: string
  width: string
  height: string
  message: string
}

export function MediaFilePicker({ includeAudio = true }: { includeAudio?: boolean }) {
  const [metadata, setMetadata] = useState<MediaMetadata>({
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

  function reset(message = "No file selected") {
    setMetadata({ durationSeconds: "", width: "", height: "", message })
    setManualDuration("")
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    revokeCurrentUrl()
    reset()
    if (!file) return

    const objectUrl = URL.createObjectURL(file)
    objectUrlRef.current = objectUrl

    if (file.type.startsWith("image/")) {
      const image = new Image()
      image.onload = () => {
        setMetadata({
          durationSeconds: "",
          width: String(image.naturalWidth || ""),
          height: String(image.naturalHeight || ""),
          message: `${image.naturalWidth}x${image.naturalHeight} image. Default is 25 seconds.`
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
          message: duration ? `Detected ${duration}s audio.` : "Audio duration unreadable"
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
      setMetadata({
        durationSeconds: duration ? String(duration) : "",
        width: video.videoWidth ? String(video.videoWidth) : "",
        height: video.videoHeight ? String(video.videoHeight) : "",
        message: duration
          ? `Detected ${duration}s video (${video.videoWidth}x${video.videoHeight}).`
          : "Video duration unreadable"
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
      <input
        name="duration_seconds"
        type="number"
        min="0"
        placeholder="Auto"
        value={manualDuration}
        onChange={(event) => setManualDuration(event.target.value)}
        className="border border-line px-3 py-2 text-sm"
      />
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
    </>
  )
}
