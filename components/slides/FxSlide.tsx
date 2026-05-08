"use client"

import { motion } from "framer-motion"
import { formatSats } from "@/lib/slides/fmt"
import type { MarketsSatsData } from "@/lib/slides/types"

export type FxSlideProps = {
  data: MarketsSatsData
}

const headerFont = { fontSize: "clamp(27px, 2vw, 39px)", lineHeight: "1", fontWeight: 900 }
const valueFont = { fontSize: "clamp(32px, 3vw, 56px)", lineHeight: "1", fontWeight: 900 }
const headerBg = "bg-red-500/80"
const contentBg = "bg-zinc-900/80"

type FlagCountry = "EUR" | "JPY" | "GBP" | "USD"

function FlagIcon({ country }: { country: FlagCountry }) {
  const size = "clamp(24px, 2.5vw, 40px)"
  if (country === "EUR") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 24"
        className="inline-block mr-2"
        style={{ verticalAlign: "middle" }}
      >
        <rect width="36" height="24" fill="#003399" />
        <circle cx="18" cy="12" r="8" fill="#FFCC00" />
        <circle cx="18" cy="12" r="6" fill="#003399" />
        <circle cx="18" cy="12" r="4" fill="#FFCC00" />
      </svg>
    )
  }
  if (country === "JPY") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 24"
        className="inline-block mr-2"
        style={{ verticalAlign: "middle" }}
      >
        <rect width="36" height="24" fill="#FFFFFF" />
        <circle cx="18" cy="12" r="7" fill="#BC002D" />
      </svg>
    )
  }
  if (country === "GBP") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 24"
        className="inline-block mr-2"
        style={{ verticalAlign: "middle" }}
      >
        <rect width="36" height="24" fill="#012169" />
        <path d="M0 0 L36 24 M36 0 L0 24" stroke="#FFFFFF" strokeWidth="2.4" />
        <path d="M0 12 L36 12 M18 0 L18 24" stroke="#FFFFFF" strokeWidth="4" />
        <path d="M0 0 L36 24 M36 0 L0 24" stroke="#C8102E" strokeWidth="1.6" />
        <path d="M0 12 L36 12 M18 0 L18 24" stroke="#C8102E" strokeWidth="2.4" />
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 24"
      className="inline-block mr-2"
      style={{ verticalAlign: "middle" }}
    >
      <rect width="36" height="24" fill="#B22234" />
      <rect width="36" height="2.67" fill="#FFFFFF" y="2.67" />
      <rect width="36" height="2.67" fill="#FFFFFF" y="5.34" />
      <rect width="36" height="2.67" fill="#FFFFFF" y="8.01" />
      <rect width="36" height="2.67" fill="#FFFFFF" y="10.68" />
      <rect width="36" height="2.67" fill="#FFFFFF" y="13.35" />
      <rect width="36" height="2.67" fill="#FFFFFF" y="16.02" />
      <rect width="36" height="2.67" fill="#FFFFFF" y="18.69" />
      <rect width="36" height="2.67" fill="#FFFFFF" y="21.36" />
      <rect width="14.4" height="10.67" fill="#3C3B6E" x="0" y="0" />
      <circle cx="3.6" cy="2.67" r="0.8" fill="#FFFFFF" />
      <circle cx="7.2" cy="2.67" r="0.8" fill="#FFFFFF" />
      <circle cx="10.8" cy="2.67" r="0.8" fill="#FFFFFF" />
      <circle cx="5.4" cy="4.67" r="0.8" fill="#FFFFFF" />
      <circle cx="9" cy="4.67" r="0.8" fill="#FFFFFF" />
    </svg>
  )
}

export function FxSlide({ data }: FxSlideProps) {
  const { fx } = data
  const currencies: Array<{ code: FlagCountry; name: string; satsPerUnit: number }> = [
    { code: "EUR", name: "Euro", satsPerUnit: fx.EUR.satsPerUnit },
    { code: "JPY", name: "Japanese Yen", satsPerUnit: fx.JPY.satsPerUnit },
    { code: "GBP", name: "British Pound", satsPerUnit: fx.GBP.satsPerUnit },
    { code: "USD", name: "US Dollar", satsPerUnit: fx.USD.satsPerUnit }
  ]

  return (
    <motion.div
      className="w-full h-full flex items-center justify-center p-8 relative bg-transparent"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Decorative globe SVG — colours are inline SVG strokes, not Tailwind tokens */}
      <div className="absolute inset-0 z-0 flex items-center justify-center opacity-30 pointer-events-none brightness-150">
        <svg
          width="200%"
          height="200%"
          viewBox="0 0 400 400"
          className="object-contain"
          preserveAspectRatio="xMidYMid meet"
          style={{ filter: "drop-shadow(0 0 3px white)", transform: "scale(2)" }}
        >
          <g transform="translate(200, 200)">
            <circle
              cx="0"
              cy="0"
              r="80"
              fill="none"
              stroke="#4169E1"
              strokeWidth="4"
              opacity="0.5"
            />
            <ellipse
              cx="0"
              cy="0"
              rx="80"
              ry="40"
              fill="none"
              stroke="#4169E1"
              strokeWidth="2"
              opacity="0.4"
            />
            <ellipse
              cx="0"
              cy="0"
              rx="80"
              ry="20"
              fill="none"
              stroke="#4169E1"
              strokeWidth="2"
              opacity="0.4"
            />
            <path
              d="M 0 -80 Q 40 0 0 80"
              fill="none"
              stroke="#4169E1"
              strokeWidth="2"
              opacity="0.4"
            />
            <path
              d="M 0 -80 Q -40 0 0 80"
              fill="none"
              stroke="#4169E1"
              strokeWidth="2"
              opacity="0.4"
            />
            {(["$", "€", "£", "¥"] as const).map((sym, i) => {
              const positions = [
                { x: 0, y: -120 },
                { x: 120, y: 0 },
                { x: 0, y: 120 },
                { x: -120, y: 0 }
              ]
              const labels = ["USD", "EUR", "GBP", "JPY"]
              const pos = positions[i]!
              return (
                <g key={sym} transform={`translate(${pos.x}, ${pos.y})`}>
                  <circle
                    cx="0"
                    cy="0"
                    r="30"
                    fill="none"
                    stroke="#4169E1"
                    strokeWidth="3"
                    opacity="0.6"
                  />
                  <text
                    x="0"
                    y="8"
                    textAnchor="middle"
                    fill="#4169E1"
                    fontSize="24"
                    fontWeight="bold"
                    opacity="0.6"
                  >
                    {sym}
                  </text>
                  <text
                    x="0"
                    y="45"
                    textAnchor="middle"
                    fill="#4169E1"
                    fontSize="14"
                    fontWeight="bold"
                    opacity="0.5"
                  >
                    {labels[i]}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      <div className="relative z-10 w-full h-full flex flex-col gap-6 justify-center">
        <div className="grid grid-cols-2 gap-6 w-full">
          {currencies.map((currency) => (
            <div key={currency.code} className="flex flex-col shadow-xl">
              <div className={`${headerBg} flex items-center justify-center px-4 py-4 h-32`}>
                <h2 className="text-white text-center tracking-wider uppercase" style={headerFont}>
                  {currency.code} - SATS PER UNIT
                </h2>
              </div>
              <div className={`flex items-center justify-center flex-1 ${contentBg} px-6 py-10`}>
                {currency.satsPerUnit > 0 ? (
                  <div
                    className="text-white tabular-nums flex items-center gap-2 whitespace-nowrap justify-center"
                    style={valueFont}
                  >
                    <FlagIcon country={currency.code} />
                    <span>
                      1 {currency.code} = {formatSats(currency.satsPerUnit).number}
                    </span>
                    <i className="fak fa-regular" />
                  </div>
                ) : (
                  <div className="text-white/60 text-center" style={valueFont}>
                    DATA UNAVAILABLE
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
