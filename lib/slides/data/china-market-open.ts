import { createMarketOpenDataSource } from "./market-open-source"

const source = createMarketOpenDataSource({
  envPrefix: "CHINA",
  logLabel: "lib/slides/data/china-market-open.ts",
  marketName: "China Market",
  regionLabel: "China/HK index board / ETF proxy",
  previewLabel: "China index board preview",
  timezone: "Asia/Shanghai",
  open: { hour: 9, minute: 30 },
  close: { hour: 15, minute: 0 },
  instruments: [
    {
      id: "shanghai",
      label: "Shanghai Composite",
      primary: ["SHCOMP", "SSE", "000001.SS"],
      proxies: ["ASHR"],
      stooq: [{ symbol: "ASHR.US", proxy: true }],
      demo: {
        symbol: "SHCOMP",
        proxySymbol: "ASHR",
        price: 3148.6,
        change: 13.8,
        changePercent: 0.44
      }
    },
    {
      id: "csi300",
      label: "CSI 300",
      primary: ["CSI300", "000300.SS"],
      proxies: ["ASHR"],
      stooq: [{ symbol: "ASHR.US", proxy: true }],
      demo: {
        symbol: "CSI300",
        proxySymbol: "ASHR",
        price: 3684.2,
        change: -9.4,
        changePercent: -0.25
      }
    },
    {
      id: "szcomp",
      label: "Shenzhen Comp",
      primary: ["SZCOMP", "399001.SZ"],
      proxies: ["CNXT"],
      stooq: [{ symbol: "CNXT.US", proxy: true }],
      demo: {
        symbol: "SZCOMP",
        proxySymbol: "CNXT",
        price: 9812.5,
        change: 42.1,
        changePercent: 0.43
      }
    },
    {
      id: "hsi",
      label: "Hang Seng",
      primary: ["HSI", "HSI.HK"],
      proxies: ["EWH"],
      stooq: [
        { symbol: "EWH.US", proxy: true },
        { symbol: "FXI.US", proxy: true }
      ],
      demo: { symbol: "HSI", proxySymbol: "EWH", price: 18840.7, change: 96.5, changePercent: 0.51 }
    }
  ]
})

export const getChinaMarketOpenData = source.getData
export const __resetChinaMarketOpenCacheForTests = source.reset
