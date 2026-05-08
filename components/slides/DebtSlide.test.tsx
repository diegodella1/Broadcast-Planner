import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DebtSlide, type DebtSlideProps } from "./DebtSlide"

import type { DebtData } from "@/lib/slides/types"

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

const baseData: DebtData = {
  liveEstimateNow: 34_000_000_000_000,
  perSecond: 50_000,
  annualFederalSpending: 6_000_000_000_000,
  annualBudgetDeficit: 1_700_000_000_000,
  btcPriceUsd: 95_000
}

describe("DebtSlide", () => {
  it("renders without crashing with valid data", () => {
    const props: DebtSlideProps = { data: baseData }
    const { container } = render(<DebtSlide {...props} />)
    expect(container).toBeInTheDocument()
  })

  it("renders the DEBT PER CITIZEN header", () => {
    render(<DebtSlide data={baseData} />)
    expect(screen.getByText(/DEBT PER CITIZEN/i)).toBeInTheDocument()
  })

  it("renders the DEBT PER TAXPAYER header", () => {
    render(<DebtSlide data={baseData} />)
    expect(screen.getByText(/DEBT PER TAXPAYER/i)).toBeInTheDocument()
  })

  it("shows DATA UNAVAILABLE for spending when annualFederalSpending is zero", () => {
    render(<DebtSlide data={{ ...baseData, annualFederalSpending: 0 }} />)
    const unavailable = screen.getAllByText("N/A")
    expect(unavailable.length).toBeGreaterThanOrEqual(1)
  })
})
