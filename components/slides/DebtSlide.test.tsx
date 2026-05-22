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
    <img alt={alt} {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)} />
  )
}))

const baseData: DebtData = {
  liveEstimateNow: 34_000_000_000_000,
  perSecond: 50_000,
  annualFederalSpending: 6_000_000_000_000,
  annualBudgetDeficit: 1_700_000_000_000,
  btcPriceUsd: 95_000,
  debtAsOf: "2026-05-21T00:00:00.000Z",
  debtSource: "Treasury",
  btcPriceSource: "Coinbase spot BTC-USD",
  btcPriceUpdatedAt: "2026-05-22T12:00:00.000Z",
  population: 340_000_000,
  populationAsOf: "2025",
  populationSource: "Census",
  taxReturns: 160_000_000,
  taxReturnsAsOf: "Tax Year 2023",
  taxReturnsSource: "IRS",
  gdpUsd: 28_000_000_000_000,
  gdpAsOf: "2025-Q1",
  gdpSource: "FRED",
  debtGdpNowPct: 121.4,
  debtGdpHistory: [
    { year: "1960", pct: 53.6 },
    { year: "1980", pct: 31.2 },
    { year: "2000", pct: 55.9 }
  ],
  debtGdpSource: "FRED"
}

describe("DebtSlide", () => {
  it("renders without crashing with valid data", () => {
    const props: DebtSlideProps = { data: baseData }
    const { container } = render(<DebtSlide {...props} />)
    expect(container).toBeInTheDocument()
  })

  it("renders the DEBT PER PERSON header", () => {
    render(<DebtSlide data={baseData} />)
    expect(screen.getByText(/DEBT PER PERSON/i)).toBeInTheDocument()
  })

  it("renders the DEBT PER TAX RETURN header", () => {
    render(<DebtSlide data={baseData} />)
    expect(screen.getByText(/DEBT PER TAX RETURN/i)).toBeInTheDocument()
  })

  it("shows DATA UNAVAILABLE for spending when annualFederalSpending is zero", () => {
    render(<DebtSlide data={{ ...baseData, annualFederalSpending: 0 }} />)
    const unavailable = screen.getAllByText("N/A")
    expect(unavailable.length).toBeGreaterThanOrEqual(1)
  })

  it("uses the provided BTC price for the main debt counter", () => {
    render(<DebtSlide data={{ ...baseData, liveEstimateNow: 200_000, btcPriceUsd: 100_000 }} />)

    expect(screen.getByText("2 BTC")).toBeInTheDocument()
  })

  it("shows debt source and BTC source metadata", () => {
    render(<DebtSlide data={baseData} />)

    expect(screen.getByText(/Estimated live from latest Treasury data/i)).toBeInTheDocument()
    expect(screen.getByText(/Coinbase spot BTC-USD/i)).toBeInTheDocument()
  })
})
