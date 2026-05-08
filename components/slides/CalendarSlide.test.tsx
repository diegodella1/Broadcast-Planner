import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CalendarSlide, type CalendarSlideProps } from "./CalendarSlide"

import type { CalendarEvent } from "@/lib/slides/types"

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    )
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

const baseEvent: CalendarEvent = {
  id: "evt-1",
  title: "Test Event",
  description: null,
  image_url: null,
  start_date: "2099-12-31",
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
  location: null,
  schedule_times: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z"
}

describe("CalendarSlide", () => {
  it("renders empty state when no events are provided", () => {
    const props: CalendarSlideProps = { events: [] }
    const { container } = render(<CalendarSlide {...props} />)
    expect(container).toBeInTheDocument()
    expect(screen.getByText("No Upcoming Events")).toBeInTheDocument()
  })

  it("renders single event title in single layout", () => {
    const props: CalendarSlideProps = { events: [baseEvent] }
    render(<CalendarSlide {...props} />)
    expect(screen.getByText("Test Event")).toBeInTheDocument()
  })

  it("renders multiple event titles in grid layout", () => {
    const events: CalendarEvent[] = [
      { ...baseEvent, id: "e1", title: "Alpha Event" },
      { ...baseEvent, id: "e2", title: "Beta Event" },
      { ...baseEvent, id: "e3", title: "Gamma Event" }
    ]
    const props: CalendarSlideProps = { events }
    render(<CalendarSlide {...props} />)
    expect(screen.getByText("Alpha Event")).toBeInTheDocument()
    expect(screen.getByText("Beta Event")).toBeInTheDocument()
    expect(screen.getByText("Gamma Event")).toBeInTheDocument()
  })
})
