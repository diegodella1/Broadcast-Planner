'use client';

import { motion } from 'framer-motion';
import { formatSats, formatChange24h } from '@/lib/slides/fmt';
import { metalsSlide } from '@/lib/slides/palette';
import type { MarketsSatsData } from '@/lib/slides/types';
import { useSlidePollingData } from './use-slide-polling-data';

export type MetalsSlideProps = {
    data: MarketsSatsData;
};

const headerBg = 'bg-red-500/80';
const contentBg = 'bg-zinc-900/80';

function CommodityCard({
    title,
    usd,
    sats,
    change24hPct,
}: {
    title: string;
    usd: number;
    sats: number;
    change24hPct: number | null;
}) {
    const headerFont = {
        fontSize: 'clamp(1.05rem, 1.45vw, 2.1rem)',
        lineHeight: '1.1',
        fontWeight: 900,
    };
    const lineFont = {
        fontSize: 'clamp(2rem, 2.15vw, 3.6rem)',
        lineHeight: '1.1',
        fontWeight: 700,
    };
    const line24hFont = {
        fontSize: 'clamp(1.65rem, 1.75vw, 3rem)',
        lineHeight: '1.1',
        fontWeight: 700,
    };

    return (
        <div className="flex min-h-0 w-full flex-col overflow-hidden border border-white/10 shadow-xl">
            <div
                className={`${headerBg} flex min-h-[4.25rem] shrink-0 items-center justify-center px-[1.25rem] py-[0.75rem]`}
            >
                <h2
                    className="text-white text-center tracking-wider uppercase truncate"
                    style={headerFont}
                >
                    {title}
                </h2>
            </div>
            <div
                className={`flex min-h-0 w-full flex-1 flex-col items-center justify-center ${contentBg} px-[1.25rem] py-[1rem]`}
            >
                {usd > 0 ? (
                    <div
                        className="flex w-full flex-col items-center py-1"
                        style={{ gap: '1.15rem' }}
                    >
                        <div className="w-full flex justify-center">
                            <span
                                className="inline-flex items-center gap-2 tabular-nums shrink-0"
                                style={{
                                    ...lineFont,
                                    color: metalsSlide.bitcoinOrange,
                                    fontWeight: 600,
                                    transform: 'translateX(-13px)',
                                }}
                            >
                                <span>{formatSats(sats).number}</span>
                                <i
                                    className="fak fa-regular shrink-0"
                                    aria-label="sats"
                                    title="sats"
                                />
                            </span>
                        </div>
                        <div className="w-full flex justify-center">
                            <span
                                className="inline-block whitespace-nowrap text-white tabular-nums"
                                style={lineFont}
                            >
                                USD $
                                {usd.toLocaleString('en-US', {
                                    maximumFractionDigits: 2,
                                    minimumFractionDigits: 2,
                                })}
                            </span>
                        </div>
                        {change24hPct !== null && (
                            <div className="w-full flex justify-center">
                                <span
                                    className="inline-flex items-center gap-2 tabular-nums"
                                    style={{ ...line24hFont, fontWeight: 500 }}
                                >
                                    <span style={{ color: metalsSlide.labelGray }}>24h</span>
                                    <span
                                        className={
                                            change24hPct >= 0 ? 'text-green-400' : 'text-red-400'
                                        }
                                    >
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
    );
}

export function MetalsSlide({ data }: MetalsSlideProps) {
    const liveData = useSlidePollingData(data, '/api/slide-data/metals');
    const { gold, silver } = liveData.metals;
    const wti = liveData.oil.wti;
    const copper = liveData.copper;

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
            <div className="relative z-10 grid h-full max-h-[calc(100vh-4rem)] w-full grid-cols-2 grid-rows-2 gap-5 px-[2rem]">
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
    );
}
