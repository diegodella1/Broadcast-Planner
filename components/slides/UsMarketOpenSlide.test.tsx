import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { UsMarketOpenSlide, type UsMarketOpenSlideProps } from "./UsMarketOpenSlide"

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...rest}>{children}</div>
    )
  }
}))

const baseData: UsMarketOpenSlideProps["data"] = {
  mode: "live",
  phase: "pre-market",
  marketName: "US Market",
  regionLabel: "US index futures / ETF proxy",
  previewLabel: "US index board preview",
  nextBellAt: "2026-05-22T13:30:00Z",
  nextBellLabel: "Opening bell",
  marketTimezone: "America/New_York",
  updatedAt: "2026-05-22T13:00:00Z",
  cacheSeconds: 30,
  source: "RTV API",
  instruments: [
    {
      id: "sp500",
      label: "S&P 500",
      symbol: "ES",
      proxySymbol: "SPY",
      price: 6300.25,
      change: 12.5,
      changePercent: 0.2,
      source: "RTV API futures/index",
      points: [
        { timestamp: "2026-05-22T12:59:00Z", price: 6290 },
        { timestamp: "2026-05-22T13:00:00Z", price: 6300.25 }
      ]
    },
    {
      id: "nasdaq100",
      label: "Nasdaq 100",
      symbol: "NQ",
      proxySymbol: "QQQ",
      price: 22900.5,
      change: -25.1,
      changePercent: -0.11,
      source: "RTV API futures/index",
      points: []
    },
    {
      id: "dow",
      label: "Dow",
      symbol: "YM",
      proxySymbol: "DIA",
      price: 46250,
      change: 90,
      changePercent: 0.19,
      source: "RTV API futures/index",
      points: []
    },
    {
      id: "russell2000",
      label: "Russell 2000",
      symbol: "RTY",
      proxySymbol: "IWM",
      price: null,
      change: null,
      changePercent: null,
      source: "RTV API",
      points: [],
      unavailable: true
    }
  ]
}

describe("UsMarketOpenSlide", () => {
  it("renders the market open countdown board", () => {
    vi.stubGlobal("fetch", vi.fn())
    render(<UsMarketOpenSlide data={baseData} />)

    expect(screen.getByText("US MARKET PRE-OPEN")).toBeInTheDocument()
    expect(screen.getByText("Opening bell")).toBeInTheDocument()
    expect(screen.getByText("S&P 500")).toBeInTheDocument()
    expect(screen.getByText("Nasdaq 100")).toBeInTheDocument()
    expect(screen.getByText("Dow")).toBeInTheDocument()
    expect(screen.getByText("Russell 2000")).toBeInTheDocument()
    expect(screen.getByText("Live · cached 30s · RTV API")).toBeInTheDocument()
  })

  it("shows unavailable state for missing symbols", () => {
    vi.stubGlobal("fetch", vi.fn())
    render(<UsMarketOpenSlide data={baseData} />)

    expect(screen.getByText("Data unavailable")).toBeInTheDocument()
  })

  it("marks demo data clearly and does not claim live caching", () => {
    vi.stubGlobal("fetch", vi.fn())
    render(
      <UsMarketOpenSlide
        data={{ ...baseData, mode: "demo", cacheSeconds: 0, source: "Demo board" }}
      />
    )

    expect(screen.getByText("Demo data - not live")).toBeInTheDocument()
    expect(screen.getByText("Demo board · not live")).toBeInTheDocument()
    expect(screen.queryByText(/cached 30s/i)).not.toBeInTheDocument()
  })
})
