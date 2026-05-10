import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ShowSlide, type ShowSlideProps } from "./ShowSlide"

import type { ShowSlideData } from "@/lib/slides/types"

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    ),
    p: ({ children, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p {...rest}>{children}</p>
    )
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

vi.mock("next/image", () => ({
  default: ({ alt, ...rest }: { alt: string; [key: string]: unknown }) => (
    <img alt={alt} {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)} />
  )
}))

const baseData: ShowSlideData = {
  name: "The Roxom Show",
  description: "Daily crypto markets coverage.",
  imageUrl: null,
  hostName: "Jane Doe",
  showDays: "Mon – Fri",
  scheduleTimes: [{ time: "9:00 AM", timezone: "ET" }]
}

describe("ShowSlide", () => {
  it("renders without crashing with minimal data (no image, no overlay)", () => {
    const minData: ShowSlideData = {
      name: "Show",
      scheduleTimes: []
    }
    const props: ShowSlideProps = { data: minData }
    const { container } = render(<ShowSlide {...props} />)
    expect(container).toBeInTheDocument()
  })

  it("renders show name, host, and schedule time when provided", () => {
    const props: ShowSlideProps = { data: baseData }
    render(<ShowSlide {...props} />)
    expect(screen.getByText("The Roxom Show")).toBeInTheDocument()
    expect(screen.getByText("Jane Doe")).toBeInTheDocument()
    expect(screen.getByText(/9:00 AM/)).toBeInTheDocument()
  })

  it("renders description when provided", () => {
    render(<ShowSlide data={baseData} />)
    expect(screen.getByText("Daily crypto markets coverage.")).toBeInTheDocument()
  })
})
