"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { formatBTC, formatBTCMain } from "@/lib/slides/fmt"
import type { DebtData } from "@/lib/slides/types"

export type DebtSlideProps = {
  data: DebtData
}

const US_POPULATION = 336_000_000
const US_TAXPAYERS = 134_000_000
const US_GDP = 28.3

const headerFont = { fontSize: "clamp(27px, 2vw, 39px)", lineHeight: "1", fontWeight: 900 }
const valueFont = { fontSize: "clamp(32px, 3vw, 56px)", lineHeight: "1", fontWeight: 900 }
const headerPadding = "px-4 py-4"
const contentPadding = "px-6 py-10"
const headerBg = "bg-red-500/80"
const contentBg = "bg-zinc-900/80"

function LiveCounter({ base, perSecond }: { base: number; perSecond: number }) {
  const [current, setCurrent] = useState(base)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => prev + perSecond)
    }, 1000)
    return () => clearInterval(interval)
  }, [perSecond])

  return (
    <div className="text-white tabular-nums text-center whitespace-nowrap" style={valueFont}>
      {formatBTCMain(current / 95000)}
    </div>
  )
}

export function DebtSlide({ data }: DebtSlideProps) {
  const btcPrice = data.btcPriceUsd > 0 ? data.btcPriceUsd : 95000
  const debtPerCitizenBTC = data.liveEstimateNow / US_POPULATION / btcPrice
  const debtPerTaxpayerBTC = data.liveEstimateNow / US_TAXPAYERS / btcPrice
  const annualFederalSpendingBTC = data.annualFederalSpending / btcPrice
  const annualBudgetDeficitBTC = data.annualBudgetDeficit / btcPrice
  const debtToGDPRatio = (data.liveEstimateNow / (US_GDP * 1_000_000_000_000)) * 100

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="h-full w-full bg-black"
    >
      <div className="w-full h-full flex flex-col gap-6 p-8 justify-center bg-transparent relative">
        <div className="absolute inset-0 z-0 flex items-center justify-center opacity-100 pointer-events-none brightness-150">
          <div className="relative w-full h-full flex items-center justify-center">
            <Image
              src="/Vector.png"
              alt="US Map Background"
              fill
              className="object-contain p-10"
              style={{ filter: "drop-shadow(0 0 3px white)" }}
              priority
            />
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-6 w-full h-full justify-center">
          <div className="grid grid-cols-3 gap-6 w-full">
            <div className="flex flex-col shadow-xl">
              <div className={`${headerBg} flex items-center justify-center ${headerPadding} h-32`}>
                <h2 className="text-white text-center tracking-wider uppercase" style={headerFont}>
                  US NATIONAL DEBT (BTC Needed at Current Price)
                </h2>
              </div>
              <div
                className={`flex items-center justify-center flex-1 ${contentBg} ${contentPadding}`}
              >
                <LiveCounter base={data.liveEstimateNow} perSecond={data.perSecond} />
              </div>
            </div>

            <div className="flex flex-col shadow-xl">
              <div className={`${headerBg} flex items-center justify-center ${headerPadding} h-32`}>
                <h3 className="text-white text-center tracking-wider uppercase" style={headerFont}>
                  DEBT PER CITIZEN
                </h3>
              </div>
              <div
                className={`flex items-center justify-center flex-1 ${contentBg} ${contentPadding}`}
              >
                <div className="text-white tabular-nums text-center" style={valueFont}>
                  {formatBTC(debtPerCitizenBTC)}
                </div>
              </div>
            </div>

            <div className="flex flex-col shadow-xl">
              <div className={`${headerBg} flex items-center justify-center ${headerPadding} h-32`}>
                <h3 className="text-white text-center tracking-wider uppercase" style={headerFont}>
                  DEBT PER TAXPAYER
                </h3>
              </div>
              <div
                className={`flex items-center justify-center flex-1 ${contentBg} ${contentPadding}`}
              >
                <div className="text-white tabular-nums text-center" style={valueFont}>
                  {formatBTC(debtPerTaxpayerBTC)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 w-full">
            <div className="flex flex-col shadow-xl">
              <div className={`${headerBg} flex items-center justify-center ${headerPadding}`}>
                <h3 className="text-white text-center tracking-wider uppercase" style={headerFont}>
                  US FEDERAL SPENDING (OFFICIAL FY TOTAL)
                </h3>
              </div>
              <div
                className={`flex flex-col items-center justify-center flex-1 ${contentBg} ${contentPadding}`}
              >
                <div className="text-white tabular-nums text-center" style={valueFont}>
                  {annualFederalSpendingBTC > 0 ? formatBTC(annualFederalSpendingBTC) : "N/A"}
                </div>
                <div className="text-white/60 text-xs sm:text-sm mt-2 text-center uppercase tracking-wider font-medium">
                  Source: U.S. Treasury MTS (FiscalData.gov) — Last Full FY
                </div>
              </div>
            </div>

            <div className="flex flex-col shadow-xl">
              <div className={`${headerBg} flex items-center justify-center ${headerPadding}`}>
                <h3 className="text-white text-center tracking-wider uppercase" style={headerFont}>
                  US FEDERAL BUDGET DEFICIT (OFFICIAL FY TOTAL)
                </h3>
              </div>
              <div
                className={`flex flex-col items-center justify-center flex-1 ${contentBg} ${contentPadding}`}
              >
                <div className="text-white tabular-nums text-center" style={valueFont}>
                  {annualBudgetDeficitBTC > 0 ? formatBTC(annualBudgetDeficitBTC) : "N/A"}
                </div>
                <div className="text-white/60 text-xs sm:text-sm mt-2 text-center uppercase tracking-wider font-medium">
                  Source: U.S. Treasury MTS (FiscalData.gov) — Last Full FY
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col shadow-xl">
            <div className={`${headerBg} flex items-center justify-center ${headerPadding}`}>
              <h3 className="text-white text-center tracking-wider uppercase" style={headerFont}>
                US FEDERAL DEBT TO GDP RATIO
              </h3>
            </div>
            <div className={`flex items-center justify-between px-12 py-6 flex-1 ${contentBg}`}>
              {(
                [
                  ["1960", "52.19%"],
                  ["1980", "34.71%"],
                  ["2000", "55.42%"],
                  ["NOW", `${debtToGDPRatio.toFixed(2)}%`]
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label} className="flex items-center gap-4">
                  <span className="text-white text-3xl font-bold">{label}</span>
                  <div className="bg-white px-4 py-2 min-w-[140px] flex justify-center">
                    <span className="text-red-600 text-3xl font-black">{value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
