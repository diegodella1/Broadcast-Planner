"use client"

import { useEffect, useRef, useState } from "react"
import type { VideoSlideData } from "@/lib/slides/types"

export type VideoSlideProps = {
  data: VideoSlideData
  onVideoEnd?: () => void
}

export function VideoSlide({ data, onVideoEnd }: VideoSlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [loopCount, setLoopCount] = useState(0)

  const maxLoops = data.loopCount
  const videoUrl = data.videoUrl

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    setLoopCount(0)
    video.currentTime = 0
    video.load()

    const handleEnded = () => {
      if (maxLoops === null) {
        video.currentTime = 0
        video.play().catch(() => undefined)
      } else {
        const newLoopCount = loopCount + 1
        setLoopCount(newLoopCount)
        if (newLoopCount < maxLoops) {
          video.currentTime = 0
          video.play().catch(() => undefined)
        } else {
          const t = setTimeout(() => {
            onVideoEnd?.()
          }, 100)
          return () => clearTimeout(t)
        }
      }
    }

    video.addEventListener("ended", handleEnded)
    video.play().catch(() => undefined)

    return () => {
      video.removeEventListener("ended", handleEnded)
      video.pause()
      video.currentTime = 0
    }
  }, [videoUrl, maxLoops, loopCount, onVideoEnd])

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-cover"
        muted
        playsInline
        preload="auto"
      />
      {process.env.NODE_ENV === "development" && maxLoops !== null && (
        <div className="absolute top-4 left-4 bg-black/50 text-white px-3 py-1 text-xs font-mono">
          Loop: {loopCount + 1} / {maxLoops}
        </div>
      )}
    </div>
  )
}
