export type MarketDatum = {
  symbol: string
  label: string
  value: string
  change: string
  changePercent: string
  updatedAt: string
}

export async function getMarketData(): Promise<MarketDatum[]> {
  const updatedAt = new Date().toISOString()
  return [
    {
      symbol: "BTC",
      label: "Bitcoin",
      value: "USD 63,850",
      change: "+820",
      changePercent: "+1.30%",
      updatedAt
    },
    {
      symbol: "ETH",
      label: "Ethereum",
      value: "USD 3,120",
      change: "+44",
      changePercent: "+1.43%",
      updatedAt
    },
    {
      symbol: "SPX",
      label: "S&P 500",
      value: "5,214.08",
      change: "-12.41",
      changePercent: "-0.24%",
      updatedAt
    },
    {
      symbol: "ARS",
      label: "USD/ARS",
      value: "1,036.50",
      change: "+1.50",
      changePercent: "+0.14%",
      updatedAt
    }
  ]
}
