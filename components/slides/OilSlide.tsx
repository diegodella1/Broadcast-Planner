'use client';

import { motion } from 'framer-motion';
import { formatSats, formatChange24h } from '@/lib/slides/fmt';
import { oilSlide } from '@/lib/slides/palette';
import type { MarketsSatsData } from '@/lib/slides/types';
import { useSlidePollingData } from './use-slide-polling-data';

export type OilSlideProps = {
    data: MarketsSatsData;
};

const headerFont = { fontSize: 'clamp(27px, 2vw, 39px)', lineHeight: '1', fontWeight: 900 };
const valueFont = { fontSize: 'clamp(32px, 3vw, 56px)', lineHeight: '1', fontWeight: 900 };
const changeFont = { fontSize: 'clamp(20px, 2vw, 32px)', lineHeight: '1', fontWeight: 900 };

type CommodityRow = {
    label: string;
    usd: number;
    sats: number;
    change24hPct: number | null;
};

function OilCard({ label, usd, sats, change24hPct }: CommodityRow) {
    const hasData = usd > 0;

    return (
        <div className="flex flex-col shadow-xl">
            <div className="bg-red-500/80 flex items-center justify-center px-4 py-4 h-32">
                <h2 className="text-white text-center tracking-wider uppercase" style={headerFont}>
                    {label}
                </h2>
            </div>
            <div className="flex items-center justify-center flex-1 bg-zinc-900/80 px-6 py-10">
                {hasData ? (
                    <div
                        className="text-white tabular-nums flex items-center gap-3 whitespace-nowrap justify-center"
                        style={valueFont}
                    >
                        <span>
                            {formatSats(sats).number} <i className="fak fa-regular" />
                        </span>
                        <span className="text-white/60">|</span>
                        <span className="text-white whitespace-nowrap">
                            USD $
                            {usd.toLocaleString('en-US', {
                                maximumFractionDigits: 2,
                                minimumFractionDigits: 2,
                            })}
                        </span>
                        {change24hPct !== null && (
                            <>
                                <span className="text-white/60">|</span>
                                <div className="flex items-center gap-2">
                                    {change24hPct < 0 ? (
                                        <svg
                                            className="w-5 h-5 text-red-400"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    ) : (
                                        <svg
                                            className="w-5 h-5 text-green-400"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fillRule="evenodd"
                                                d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    )}
                                    <span
                                        className={`tabular-nums ${change24hPct >= 0 ? 'text-green-400' : 'text-red-400'}`}
                                        style={changeFont}
                                    >
                                        {formatChange24h(change24hPct)}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="text-white/60 text-center" style={valueFont}>
                        DATA UNAVAILABLE
                    </div>
                )}
            </div>
        </div>
    );
}

export function OilSlide({ data }: OilSlideProps) {
    const liveData = useSlidePollingData(data, '/api/slide-data/markets');
    const wti = liveData.oil.wti;
    const brent = liveData.oil.brent;

    return (
        <motion.div
            className="w-full h-full flex items-center justify-center p-8 relative bg-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
        >
            {/* Decorative oil derrick SVG background */}
            <div className="absolute inset-0 z-0 flex items-center justify-center opacity-30 pointer-events-none brightness-150">
                <svg
                    width="200%"
                    height="200%"
                    viewBox="0 0 400 400"
                    className="object-contain"
                    preserveAspectRatio="xMidYMid meet"
                    style={{ filter: 'drop-shadow(0 0 3px white)', transform: 'scale(2)' }}
                    aria-hidden
                >
                    <g transform="translate(200, 200)">
                        <path
                            d="M 0 -120 L -60 80 L 60 80 Z"
                            fill="none"
                            stroke={oilSlide.derrickGray}
                            strokeWidth="5"
                            opacity="0.6"
                        />
                        <line
                            x1="-40"
                            y1="-60"
                            x2="40"
                            y2="-60"
                            stroke={oilSlide.derrickGray}
                            strokeWidth="3"
                            opacity="0.5"
                        />
                        <line
                            x1="-30"
                            y1="0"
                            x2="30"
                            y2="0"
                            stroke={oilSlide.derrickGray}
                            strokeWidth="3"
                            opacity="0.5"
                        />
                        <line
                            x1="-20"
                            y1="40"
                            x2="20"
                            y2="40"
                            stroke={oilSlide.derrickGray}
                            strokeWidth="3"
                            opacity="0.5"
                        />
                        <line
                            x1="-50"
                            y1="-100"
                            x2="-50"
                            y2="70"
                            stroke={oilSlide.derrickGray}
                            strokeWidth="2"
                            opacity="0.4"
                        />
                        <line
                            x1="50"
                            y1="-100"
                            x2="50"
                            y2="70"
                            stroke={oilSlide.derrickGray}
                            strokeWidth="2"
                            opacity="0.4"
                        />
                        <g transform="translate(-80, 80)">
                            <rect
                                x="-15"
                                y="0"
                                width="30"
                                height="20"
                                rx="2"
                                fill="none"
                                stroke={oilSlide.derrickGray}
                                strokeWidth="2"
                                opacity="0.5"
                            />
                            <line
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="-40"
                                stroke={oilSlide.derrickGray}
                                strokeWidth="3"
                                opacity="0.5"
                            />
                            <circle
                                cx="0"
                                cy="-40"
                                r="8"
                                fill="none"
                                stroke={oilSlide.derrickGray}
                                strokeWidth="2"
                                opacity="0.5"
                            />
                            <rect
                                x="-8"
                                y="-50"
                                width="16"
                                height="20"
                                rx="2"
                                fill="none"
                                stroke={oilSlide.derrickGray}
                                strokeWidth="2"
                                opacity="0.5"
                            />
                        </g>
                        <g transform="translate(80, 80)">
                            <ellipse
                                cx="0"
                                cy="0"
                                rx="25"
                                ry="18"
                                fill="none"
                                stroke={oilSlide.barrelLight}
                                strokeWidth="3"
                                opacity="0.5"
                            />
                            <ellipse
                                cx="0"
                                cy="-18"
                                rx="25"
                                ry="5"
                                fill="none"
                                stroke={oilSlide.barrelDark}
                                strokeWidth="2"
                                opacity="0.5"
                            />
                            <ellipse
                                cx="0"
                                cy="18"
                                rx="25"
                                ry="5"
                                fill="none"
                                stroke={oilSlide.barrelDark}
                                strokeWidth="2"
                                opacity="0.5"
                            />
                            <line
                                x1="-25"
                                y1="-10"
                                x2="25"
                                y2="-10"
                                stroke={oilSlide.barrelLight}
                                strokeWidth="1.5"
                                opacity="0.4"
                            />
                            <line
                                x1="-25"
                                y1="10"
                                x2="25"
                                y2="10"
                                stroke={oilSlide.barrelLight}
                                strokeWidth="1.5"
                                opacity="0.4"
                            />
                        </g>
                    </g>
                </svg>
            </div>

            <div className="relative z-10 w-full max-w-4xl flex flex-col gap-6 justify-center">
                <OilCard
                    label="WTI CRUDE OIL - SATS PER BARREL"
                    usd={wti.usd}
                    sats={wti.sats}
                    change24hPct={wti.change24hPct}
                />
                <OilCard
                    label="BRENT CRUDE OIL - SATS PER BARREL"
                    usd={brent.usd}
                    sats={brent.sats}
                    change24hPct={brent.change24hPct}
                />
            </div>
        </motion.div>
    );
}
