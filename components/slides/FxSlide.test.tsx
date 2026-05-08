import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { FxSlide, type FxSlideProps } from "./FxSlide"

import type { MarketsSatsData } from "@/lib/slides/types"

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    )
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

const baseData: MarketsSatsData = {
  btcUsd: 95_000,
  timestamp: "2024-01-01T00:00:00Z",
  metals: {
    gold: { usd: 2300, sats: 2_400_000, change24hPct: 0.5 },
    silver: { usd: 28, sats: 29_000, change24hPct: -0.2 }
  },
  oil: {
    wti: { usd: 75, sats: 78_000, change24hPct: 1.1 },
    brent: { usd: 80, sats: 84_000, change24hPct: 0.8 }
  },
  copper: { usd: 4.2, sats: 4_400, change24hPct: null },
  fx: {
    EUR: { usdPerUnit: 1.08, satsPerUnit: 113_684 },
    JPY: { usdPerUnit: 0.0067, satsPerUnit: 705 },
    GBP: { usdPerUnit: 1.27, satsPerUnit: 133_684 },
    USD: { usdPerUnit: 1.0, satsPerUnit: 105_263 }
  }
}

describe("FxSlide", () => {
  it("renders without crashing with valid data", () => {
    const props: FxSlideProps = { data: baseData }
    const { container } = render(<FxSlide {...props} />)
    expect(container).toBeInTheDocument()
  })

  it("renders all four currency pair headers", () => {
    render(<FxSlide data={baseData} />)
    expect(screen.getByText(/EUR - SATS PER UNIT/i)).toBeInTheDocument()
    expect(screen.getByText(/JPY - SATS PER UNIT/i)).toBeInTheDocument()
    expect(screen.getByText(/GBP - SATS PER UNIT/i)).toBeInTheDocument()
    expect(screen.getByText(/USD - SATS PER UNIT/i)).toBeInTheDocument()
  })

  it("shows DATA UNAVAILABLE when satsPerUnit is zero", () => {
    const dataWithZero: MarketsSatsData = {
      ...baseData,
      fx: {
        ...baseData.fx,
        EUR: { usdPerUnit: 0, satsPerUnit: 0 }
      }
    }
    render(<FxSlide data={dataWithZero} />)
    expect(screen.getByText("DATA UNAVAILABLE")).toBeInTheDocument()
  })
})
