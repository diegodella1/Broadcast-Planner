import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { StrcSlide, type StrcSlideProps } from "./StrcSlide"

import type { StrcData } from "@/lib/slides/types"

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    )
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

const baseData: StrcData = {
  strc: {
    price: 100.0,
    previousClose: 99.0,
    priceChange: 1.0,
    priceChangePercent: 1.01,
    negative: false,
    volume: 250_000
  },
  btc: { price: 95_000 },
  dividends: [],
  metrics: {
    parValue: 100.0,
    annualDiv: 10.0,
    annualRate: 0.1,
    monthlyDiv: 0.833,
    monthlyDivBtc: 0.00000876,
    annualDivBtc: 0.0001052,
    effYield: 10.0,
    marketCap: 5_000_000_000,
    sharesOutstanding: 50_000_000,
    nextPayoutDate: "2099-12-15",
    nextRecordDate: "2099-12-10"
  },
  lastUpdate: "2024-01-01T12:00:00Z"
}

describe("StrcSlide", () => {
  it("renders without crashing with valid data", () => {
    const props: StrcSlideProps = { data: baseData }
    const { container } = render(<StrcSlide {...props} />)
    expect(container).toBeInTheDocument()
  })

  it("renders the STRC ticker label", () => {
    render(<StrcSlide data={baseData} />)
    expect(screen.getByText("STRC")).toBeInTheDocument()
  })

  it("renders STANDBY label when there is no dividend payout today", () => {
    render(<StrcSlide data={baseData} />)
    expect(screen.getByText("STANDBY")).toBeInTheDocument()
  })
})
