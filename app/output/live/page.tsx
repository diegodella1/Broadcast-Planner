import { headers } from "next/headers"
import { EmergencySlate, OutputRenderer } from "@/components/output-renderer"
import { getLivePlaybackSchedule } from "@/lib/data"
import { secondsSinceLocalMidnight } from "@/lib/time"
import { prefetchSlideData } from "@/lib/slides/prefetch"
import type { SlideTemplateId } from "@/lib/slides/registry"
import type { ScheduleBundle } from "@/lib/types"

export default async function OutputLivePage({
  searchParams
}: {
  searchParams: Promise<{ debug?: string; startAt?: string }>
}) {
  const params = await searchParams
  const schedule = await getScheduleOrEmergency(getLivePlaybackSchedule)
  const startAt = params.startAt ? Number(params.startAt) : null
  if (!schedule) return <EmergencySlate reason="Schedule data unavailable" />

  const enriched = await enrichTemplateSlides(schedule)

  return (
    <OutputRenderer
      initialSchedule={enriched}
      initialSeconds={Number.isFinite(startAt) ? startAt! : secondsSinceLocalMidnight()}
      debug={params.debug === "true"}
    />
  )
}

async function enrichTemplateSlides(schedule: ScheduleBundle): Promise<ScheduleBundle> {
  const hdrs = await headers()
  const host = hdrs.get("host") ?? "localhost:3000"
  const proto = host.startsWith("localhost") ? "http" : "https"
  const baseUrl = `${proto}://${host}`

  const enrichedSlides = await Promise.all(
    schedule.slideAssets.map(async (slide) => {
      if (slide.slideType !== "template" || !slide.templateId) return slide
      const slideData = await prefetchSlideData(slide.templateId as SlideTemplateId, baseUrl)
      return { ...slide, metadata: { slideData } }
    })
  )

  return { ...schedule, slideAssets: enrichedSlides }
}

async function getScheduleOrEmergency(
  loader: () => Promise<Awaited<ReturnType<typeof getLivePlaybackSchedule>>>
) {
  try {
    return await loader()
  } catch {
    return null
  }
}
