import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { NewsSlide, type NewsSlideProps } from "./NewsSlide"

import type { NewsSlideData } from "@/lib/slides/types"

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    ),
    h1: ({ children, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) => (
      <h1 {...rest}>{children}</h1>
    ),
    p: ({ children, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) => (
      <p {...rest}>{children}</p>
    )
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

const baseData: NewsSlideData = {
  imageUrl: "https://example.com/news.jpg",
  headline: "Bitcoin Hits New All-Time High",
  description: "BTC surpassed $200,000 today.",
  source: "CoinDesk",
  durationSeconds: 15
}

describe("NewsSlide", () => {
  it("renders no-image fallback when imageUrl is empty string", () => {
    const props: NewsSlideProps = {
      data: { ...baseData, imageUrl: "" }
    }
    render(<NewsSlide {...props} />)
    expect(screen.getByText("No image configured for news slide")).toBeInTheDocument()
  })

  it("renders the headline when imageUrl is present", () => {
    const props: NewsSlideProps = { data: baseData }
    render(<NewsSlide {...props} />)
    expect(screen.getByText("Bitcoin Hits New All-Time High")).toBeInTheDocument()
  })

  it("renders source label and description when provided", () => {
    const props: NewsSlideProps = { data: baseData }
    render(<NewsSlide {...props} />)
    expect(screen.getByText("CoinDesk")).toBeInTheDocument()
    expect(screen.getByText("BTC surpassed $200,000 today.")).toBeInTheDocument()
  })
})
