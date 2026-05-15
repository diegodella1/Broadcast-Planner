import { SLIDE_TEMPLATES, type SlideTemplateId } from "./registry"
import type {
  CalendarEvent,
  DebtData,
  MarketsSatsData,
  NewsSlideData,
  SataData,
  ShowSlideData,
  StrcData,
  VideoSlideData
} from "./types"

type Json = Record<string, unknown>

export async function getSlideRenderData(templateId: SlideTemplateId) {
  const entry = SLIDE_TEMPLATES.find((template) => template.id === templateId)
  const raw = entry?.dataEndpoint ? await fetchSlideData(entry.dataEndpoint) : null
  return adaptSlideData(templateId, raw)
}

async function fetchSlideData(endpoint: string) {
  const base =
    process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "http://127.0.0.1:3450"
  try {
    const response = await fetch(new URL(endpoint, base), { cache: "no-store" })
    if (!response.ok) return null
    return (await response.json()) as unknown
  } catch {
    return null
  }
}

function adaptSlideData(templateId: SlideTemplateId, raw: unknown): unknown {
  if (templateId === "calendar") return { events: pickEvents(raw) }
  if (templateId === "event") {
    const events = pickEvents(raw)
    return { selectedEventIds: events.slice(0, 2).map((event) => event.id), events }
  }
  if (templateId === "event-modern") {
    const events = pickEvents(raw)
    return {
      selectedEventIds: events.slice(0, 4).map((event) => event.id),
      events,
      eventSlideTitle: "Upcoming"
    }
  }
  if (templateId === "strc") return { data: pickNested(raw, "strc") ?? mockStrcData() }
  if (templateId === "sata") return { data: pickNested(raw, "sata") ?? mockSataData() }
  if (templateId === "debt") return { data: isObject(raw) ? raw : mockDebtData() }
  if (templateId === "news") return { data: isObject(raw) ? raw : mockNewsData() }
  if (templateId === "show") return { data: mockShowData() }
  if (templateId === "video") return { data: mockVideoData() }
  return { data: isObject(raw) ? raw : mockMarketsData() }
}

function pickEvents(raw: unknown): CalendarEvent[] {
  if (Array.isArray(raw)) return raw as CalendarEvent[]
  if (isObject(raw) && Array.isArray(raw.events)) return raw.events as CalendarEvent[]
  return mockEvents()
}

function pickNested(raw: unknown, key: string) {
  if (!isObject(raw)) return null
  const value = raw[key]
  return isObject(value) ? value : null
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function mockMarketsData(): MarketsSatsData {
  return {
    btcUsd: 103500,
    timestamp: new Date().toISOString(),
    metals: {
      gold: { usd: 3380, sats: 3265700, change24hPct: 0.4 },
      silver: { usd: 33.8, sats: 32657, change24hPct: -0.2 }
    },
    oil: {
      wti: { usd: 63.2, sats: 61063, change24hPct: 0.7 },
      brent: { usd: 66.5, sats: 64251, change24hPct: 0.5 }
    },
    copper: { usd: 4.75, sats: 4590, change24hPct: 0.1 },
    fx: {
      EUR: { usdPerUnit: 1.09, satsPerUnit: 1053 },
      JPY: { usdPerUnit: 0.0065, satsPerUnit: 6 },
      GBP: { usdPerUnit: 1.28, satsPerUnit: 1237 },
      USD: { usdPerUnit: 1, satsPerUnit: 966 }
    },
    stale: true
  }
}

function mockDebtData(): DebtData {
  return {
    liveEstimateNow: 36000000000000,
    perSecond: 70000,
    annualFederalSpending: 6800000000000,
    annualBudgetDeficit: 1900000000000,
    btcPriceUsd: 103500
  }
}

function mockStrcData(): StrcData {
  return {
    strc: {
      price: 89.4,
      previousClose: 88.2,
      priceChange: 1.2,
      priceChangePercent: 1.36,
      negative: false,
      volume: 124000
    },
    btc: { price: 103500 },
    dividends: [
      {
        period: "May 2026",
        recordDate: "2026-05-15",
        payDate: "2026-05-30",
        usd: 0.72,
        rate: 0.008,
        btc: 0.00000695
      }
    ],
    metrics: {
      parValue: 100,
      annualDiv: 8.64,
      annualRate: 0.0864,
      monthlyDiv: 0.72,
      monthlyDivBtc: 0.00000695,
      annualDivBtc: 0.0000835,
      effYield: 0.0966,
      marketCap: 1800000000,
      sharesOutstanding: 20100000,
      nextPayoutDate: "2026-05-30",
      nextRecordDate: "2026-05-15"
    },
    lastUpdate: new Date().toISOString()
  }
}

function mockSataData(): SataData {
  return {
    preferred: {
      ticker: "SATA",
      name: "SATA Income ETF",
      price: 25.1,
      priceChange: 0.05,
      priceChangePercent: 0.2,
      volume: 52000,
      previousClose: 25.05
    },
    btc: { price: 103500 },
    metrics: {
      monthlyDiv: 0.19,
      annualDiv: 2.28,
      monthlyDivBtc: 0.00000184,
      annualDivBtc: 0.000022,
      effYield: 0.0908,
      marketCap: 410000000,
      sharesOutstanding: 16300000,
      nextPayoutDate: "2026-05-30",
      nextRecordDate: "2026-05-15",
      companyName: "SATA Income ETF",
      yearHigh: 26.2,
      yearLow: 23.7,
      avgVolume30D: 61000
    },
    source: "mock",
    lastUpdate: new Date().toISOString()
  }
}

function mockNewsData(): NewsSlideData {
  return {
    imageUrl:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1920&auto=format&fit=crop",
    headline: "Market update",
    description: "Fallback headline while live feeds warm up.",
    source: "RTV",
    durationSeconds: 30
  }
}

function mockShowData(): ShowSlideData {
  return {
    name: "Roxom Report",
    description: "Live market programming",
    hostName: "RTV",
    showDays: "Weekdays",
    scheduleTimes: [{ timezone: "SF", time: "07:40" }]
  }
}

function mockVideoData(): VideoSlideData {
  return { videoUrl: "", loopCount: null }
}

function mockEvents(): CalendarEvent[] {
  return [
    {
      id: "mock-event-1",
      title: "Market Open",
      description: "Daily coverage and market context",
      image_url: null,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: null,
      start_time: "07:40",
      end_time: "08:40",
      is_active: true,
      order_index: 1,
      color: "#22c55e",
      title_font: null,
      title_size: "large",
      title_color: null,
      text_color: null,
      overlay_opacity: null,
      show_date_badge: true,
      location: "RTV",
      schedule_times: [{ timezone: "SF", time: "07:40" }],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ]
}
