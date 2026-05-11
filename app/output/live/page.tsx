import { headers } from "next/headers"
import { EmergencySlate, OutputRenderer } from "@/components/output-renderer"
import { getLivePlaybackSchedule } from "@/lib/data"
import { forcedBadMediaSchedule, outputFixturesEnabled } from "@/lib/output-fixtures"
import { isOutputRequestAllowed, outputAccessDeniedReason } from "@/lib/output-auth"
import { secondsSinceMidnightInTimezone } from "@/lib/time"
import { prefetchSlideData } from "@/lib/slides/prefetch"
import type { SlideTemplateId } from "@/lib/slides/registry"
import type { ScheduleBundle } from "@/lib/types"

export default async function OutputLivePage({
  searchParams
}: {
  searchParams: Promise<{ debug?: string; startAt?: string; token?: string; fixture?: string }>
}) {
  const params = await searchParams
  if (!(await isOutputRequestAllowed(params))) {
    return <EmergencySlate reason={outputAccessDeniedReason()} />
  }
  const schedule =
    params.fixture === "bad-media" && outputFixturesEnabled()
      ? forcedBadMediaSchedule()
      : await getScheduleOrEmergency(getLivePlaybackSchedule)
  const startAt = params.startAt ? Number(params.startAt) : null
  if (!schedule) return <EmergencySlate reason="Schedule data unavailable" />

  const enriched = await enrichTemplateSlides(schedule)

  const rendererProps = {
    initialSchedule: enriched,
    initialSeconds: Number.isFinite(startAt) ? startAt! : secondsSinceMidnightInTimezone(),
    debug: params.debug === "true",
    outputToken: params.token,
    ...(params.fixture === "bad-media" ? { forcedBlockId: "fixture-bad-media" } : {})
  }

  return <OutputRenderer {...rendererProps} />
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
