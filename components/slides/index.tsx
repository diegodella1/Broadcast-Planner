"use client"

import { CalendarSlide, type CalendarSlideProps } from "./CalendarSlide"
import { DebtSlide, type DebtSlideProps } from "./DebtSlide"
import { EventSlide, type EventSlideProps } from "./EventSlide"
import { EventSlideModern, type EventSlideModernProps } from "./EventSlideModern"
import { FxSlide, type FxSlideProps } from "./FxSlide"
import { GoldSlide, type GoldSlideProps } from "./GoldSlide"
import { MetalsSlide, type MetalsSlideProps } from "./MetalsSlide"
import { NewsSlide, type NewsSlideProps } from "./NewsSlide"
import { OilSlide, type OilSlideProps } from "./OilSlide"
import { SataSlide, type SataSlideProps } from "./SataSlide"
import { ShowSlide, type ShowSlideProps } from "./ShowSlide"
import { SilverSlide, type SilverSlideProps } from "./SilverSlide"
import { StrcSlide, type StrcSlideProps } from "./StrcSlide"
import { VideoSlide, type VideoSlideProps } from "./VideoSlide"

import type { SlideTemplateId } from "@/lib/slides/registry"

export type SlideTemplateRendererProps = {
  templateId: SlideTemplateId
  data: unknown
}

export function SlideTemplateRenderer({ templateId, data }: SlideTemplateRendererProps) {
  switch (templateId) {
    case "calendar":
      return <CalendarSlide {...(data as CalendarSlideProps)} />
    case "debt":
      return <DebtSlide {...(data as DebtSlideProps)} />
    case "event":
      return <EventSlide {...(data as EventSlideProps)} />
    case "event-modern":
      return <EventSlideModern {...(data as EventSlideModernProps)} />
    case "fx":
      return <FxSlide {...(data as FxSlideProps)} />
    case "gold":
      return <GoldSlide {...(data as GoldSlideProps)} />
    case "metals":
      return <MetalsSlide {...(data as MetalsSlideProps)} />
    case "news":
      return <NewsSlide {...(data as NewsSlideProps)} />
    case "oil":
      return <OilSlide {...(data as OilSlideProps)} />
    case "sata":
      return <SataSlide {...(data as SataSlideProps)} />
    case "show":
      return <ShowSlide {...(data as ShowSlideProps)} />
    case "silver":
      return <SilverSlide {...(data as SilverSlideProps)} />
    case "strc":
      return <StrcSlide {...(data as StrcSlideProps)} />
    case "video":
      return <VideoSlide {...(data as VideoSlideProps)} />
  }
}
