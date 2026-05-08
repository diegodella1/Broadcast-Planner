"use client"

import { motion } from "framer-motion"
import { formatSats, formatChange24h } from "@/lib/slides/fmt"
import type { MarketsSatsData } from "@/lib/slides/types"

export type MetalsSlideProps = {
  data: MarketsSatsData
}

const headerBg = "bg-red-500/80"
const contentBg = "bg-zinc-900/80"

function CommodityCard({
  title,
  usd,
  sats,
  change24hPct
}: {
  title: string
  usd: number
  sats: number
  change24hPct: number | null
}) {
  const headerFont = {
    fontSize: "clamp(calc(1.25rem - 3px), 1.8vw, calc(2.75rem - 3px))",
    lineHeight: "1.1",
    fontWeight: 900
  }
  const lineFont = {
    fontSize: "clamp(calc(1.5rem + 10px), 2.6vw, calc(4rem + 15px))",
    lineHeight: "1.1",
    fontWeight: 700
  }
  const line24hFont = {
    fontSize: "clamp(calc(1.25rem + 10px), 2vw, calc(3.5rem + 15px))",
    lineHeight: "1.1",
    fontWeight: 700
  }

  return (
    <div className="flex flex-col shadow-xl overflow-hidden border border-white/10 w-full">
      <div
        className={`${headerBg} flex items-center justify-center shrink-0 min-h-[5rem] px-[1.25rem] py-[1rem]`}
      >
        <h2 className="text-white text-center tracking-wider uppercase truncate" style={headerFont}>
          {title}
        </h2>
      </div>
      <div
        className={`flex flex-col items-center justify-center w-full ${contentBg} px-[1.25rem] py-[1.5rem]`}
      >
        {usd > 0 ? (
          <div className="flex flex-col items-center w-full py-2" style={{ gap: "2.5rem" }}>
            <div className="w-full flex justify-center">
              <span
                className="inline-flex items-center gap-2 tabular-nums shrink-0"
                style={{
                  ...lineFont,
                  color: "#F7931A",
                  fontWeight: 600,
                  transform: "translateX(-13px)"
                }}
              >
                <i className="fak fa-regular shrink-0" aria-hidden />
                <span>{formatSats(sats).number}</span>
              </span>
            </div>
            <div className="w-full flex justify-center">
              <span
                className="inline-block text-white tabular-nums whitespace-nowrap"
                style={lineFont}
              >
                USD $
                {usd.toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2
                })}
              </span>
            </div>
            {change24hPct !== null && (
              <div className="w-full flex justify-center">
                <span
                  className="inline-flex items-center gap-2 tabular-nums"
                  style={{ ...line24hFont, fontWeight: 500 }}
                >
                  <span style={{ color: "#A5A5A5" }}>24h</span>
                  <span className={change24hPct >= 0 ? "text-green-400" : "text-red-400"}>
                    {formatChange24h(change24hPct)}
                  </span>
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-white/60 text-center" style={lineFont}>
            —
          </div>
        )}
      </div>
    </div>
  )
}

export function MetalsSlide({ data }: MetalsSlideProps) {
  const { gold, silver } = data.metals
  const wti = data.oil.wti
  const copper = data.copper

  return (
    <motion.div
      className="w-full h-full flex items-center justify-center relative bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <video
        className="absolute inset-0 w-full h-full object-cover blur-[8px] scale-105"
        autoPlay
        muted
        loop
        playsInline
        aria-hidden
      >
        <source src="/stock-bg.mp4" type="video/mp4" />
      </video>
      <div
        className="relative z-10 w-full max-w-none grid grid-cols-2 gap-[4rem] items-start px-[2rem] -translate-x-[5px]"
        style={{ gridAutoRows: "minmax(0, auto)" }}
      >
        <CommodityCard
          title="GOLD (XAU) – SATS/TROY OZ"
          usd={gold.usd}
          sats={gold.sats}
          change24hPct={gold.change24hPct}
        />
        <CommodityCard
          title="OIL (WTI) – SATS/BARREL"
          usd={wti.usd}
          sats={wti.sats}
          change24hPct={wti.change24hPct}
        />
        <CommodityCard
          title="SILVER (XAG) – SATS/TROY OZ"
          usd={silver.usd}
          sats={silver.sats}
          change24hPct={silver.change24hPct}
        />
        <CommodityCard
          title="ISHARES COPPER (ETF) – SATS/SHARE"
          usd={copper.usd}
          sats={copper.sats}
          change24hPct={copper.change24hPct}
        />
      </div>
    </motion.div>
  )
}
