import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { BlockBadge } from "./block-badge"

import type { BlockCategory } from "@/lib/types"

describe("BlockBadge", () => {
  it("renders the label text", () => {
    render(<BlockBadge category="mercados" label="Markets" />)
    expect(screen.getByText("Markets")).toBeInTheDocument()
  })

  it("sets role='status' and aria-label on the span", () => {
    render(<BlockBadge category="clima" label="Weather" />)
    const badge = screen.getByRole("status")
    expect(badge).toHaveAttribute("aria-label", "Weather")
  })

  it("applies info-blue token classes for mercados", () => {
    render(<BlockBadge category="mercados" label="Markets" />)
    const badge = screen.getByRole("status")
    expect(badge.className).toContain("bg-info-blue/10")
    expect(badge.className).toContain("text-info-blue")
  })

  it("applies warn-amber token classes for clima", () => {
    render(<BlockBadge category="clima" label="Weather" />)
    const badge = screen.getByRole("status")
    expect(badge.className).toContain("bg-warn-amber/10")
    expect(badge.className).toContain("text-warn-amber")
  })

  it("applies warn-amber token classes for calendario", () => {
    render(<BlockBadge category="calendario" label="Calendar" />)
    const badge = screen.getByRole("status")
    expect(badge.className).toContain("bg-warn-amber/10")
    expect(badge.className).toContain("text-warn-amber")
  })

  it("applies accent-positive token classes for earthcam", () => {
    render(<BlockBadge category="earthcam" label="Earthcam" />)
    const badge = screen.getByRole("status")
    expect(badge.className).toContain("bg-accent-positive/10")
    expect(badge.className).toContain("text-accent-positive")
  })

  it("applies accent-positive token classes for trending", () => {
    render(<BlockBadge category="trending" label="Trending" />)
    const badge = screen.getByRole("status")
    expect(badge.className).toContain("bg-accent-positive/10")
    expect(badge.className).toContain("text-accent-positive")
  })

  it("applies info-violet token classes for deuda", () => {
    render(<BlockBadge category="deuda" label="Debt" />)
    const badge = screen.getByRole("status")
    expect(badge.className).toContain("bg-info-violet/10")
    expect(badge.className).toContain("text-info-violet")
  })

  it("applies negative-red token classes for reuters", () => {
    render(<BlockBadge category="reuters" label="Reuters" />)
    const badge = screen.getByRole("status")
    expect(badge.className).toContain("bg-negative-red/10")
    expect(badge.className).toContain("text-negative-red")
  })

  it("applies negative-red token classes for broadcast", () => {
    render(<BlockBadge category="broadcast" label="Broadcast" />)
    const badge = screen.getByRole("status")
    expect(badge.className).toContain("bg-negative-red/10")
    expect(badge.className).toContain("text-negative-red")
  })

  it("renders all 8 categories without throwing", () => {
    const categories: BlockCategory[] = [
      "mercados",
      "earthcam",
      "clima",
      "calendario",
      "trending",
      "deuda",
      "reuters",
      "broadcast"
    ]
    for (const category of categories) {
      const { unmount } = render(<BlockBadge category={category} label={category} />)
      expect(screen.getByRole("status")).toBeInTheDocument()
      unmount()
    }
  })

  it("applies sm padding classes by default", () => {
    render(<BlockBadge category="mercados" label="Markets" />)
    const badge = screen.getByRole("status")
    expect(badge.className).toContain("px-1.5")
    expect(badge.className).toContain("py-0.5")
    expect(badge.className).toContain("text-[10px]")
  })

  it("applies md padding classes when size='md'", () => {
    render(<BlockBadge category="mercados" label="Markets" size="md" />)
    const badge = screen.getByRole("status")
    expect(badge.className).toContain("px-2")
    expect(badge.className).toContain("py-1")
    expect(badge.className).toContain("text-xs")
  })

  it("passes through custom className", () => {
    render(<BlockBadge category="mercados" label="Markets" className="custom-class" />)
    expect(screen.getByRole("status").className).toContain("custom-class")
  })
})
