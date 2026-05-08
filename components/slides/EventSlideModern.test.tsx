import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { EventSlideModern, type EventSlideModernProps } from "./EventSlideModern"

import type { CalendarEvent } from "@/lib/slides/types"

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    )
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock("next/image", () => ({
  default: ({ alt, ...rest }: { alt: string; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)} />
  )
}))

const baseEvent: CalendarEvent = {
  id: "em1",
  title: "Market Week",
  description: "A week of markets",
  image_url: null,
  start_date: "2099-07-10",
  end_date: null,
  start_time: null,
  end_time: null,
  is_active: true,
  order_index: 0,
  color: "#10B981",
  title_font: null,
  title_size: null,
  title_color: null,
  text_color: null,
  overlay_opacity: null,
  show_date_badge: true,
  location: "New York",
  schedule_times: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z"
}

describe("EventSlideModern", () => {
  it("renders empty state when no event IDs are selected", () => {
    const props: EventSlideModernProps = {
      selectedEventIds: [],
      events: [baseEvent]
    }
    render(<EventSlideModern {...props} />)
    expect(screen.getByText("No events selected")).toBeInTheDocument()
  })

  it("renders the event title for a selected event", () => {
    const props: EventSlideModernProps = {
      selectedEventIds: ["em1"],
      events: [baseEvent]
    }
    render(<EventSlideModern {...props} />)
    // The component renders title in original casing; CSS text-transform: uppercase is visual only.
    expect(screen.getByText("Market Week")).toBeInTheDocument()
  })

  it("renders the optional eventSlideTitle when provided", () => {
    const props: EventSlideModernProps = {
      selectedEventIds: ["em1"],
      events: [baseEvent],
      eventSlideTitle: "Upcoming Events"
    }
    render(<EventSlideModern {...props} />)
    expect(screen.getByText("Upcoming Events")).toBeInTheDocument()
  })
})
