'use client';

import { motion } from 'framer-motion';
import { useEffect, useId, useMemo, useState } from 'react';

import { usMarketOpenSlide } from '@/lib/slides/palette';
import type { MarketIndex, MarketOpenData, MarketOpenPhase } from '@/lib/slides/types';
import { useSlidePollingData } from './use-slide-polling-data';

export type MarketOpenSlideProps = {
    data: MarketOpenData;
    endpoint: string;
};

const POLL_MS = 30_000;

const phaseSuffixes: Record<MarketOpenPhase, string> = {
    'pre-market': 'PRE-OPEN',
    open: 'LIVE',
    'after-hours': 'AFTER HOURS',
    closed: 'CLOSED',
};

export function MarketOpenSlide({ data, endpoint }: MarketOpenSlideProps) {
    const liveData = useSlidePollingData(data, endpoint, POLL_MS);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);

        return () => clearInterval(timer);
    }, []);

    const remaining = Math.max(0, new Date(liveData.nextBellAt).getTime() - now);
    const marketTone = liveData.phase === 'open' ? 'text-emerald-300' : 'text-amber-200';
    const isDemo = liveData.mode === 'demo';
    const isUnavailable = liveData.mode === 'unavailable';

    return (
        <motion.div
            className="relative h-full w-full overflow-hidden bg-[#06070a] text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
        >
            <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.07),transparent_42%),radial-gradient(circle_at_88%_18%,rgba(255,64,64,0.16),transparent_34%)]" />
            <div className="absolute left-0 top-0 h-full w-[10px] bg-red-500" />

            <div className="relative z-10 flex h-full flex-col px-8 py-6">
                {liveData.stale ? (
                    <div className="absolute right-8 top-6 z-20 border border-amber-300/45 bg-amber-300/14 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-amber-100">
                        Delayed
                    </div>
                ) : null}
                {isDemo && (
                    <div className="mb-5 flex items-center justify-center border border-amber-300/45 bg-amber-300/14 px-5 py-3 text-center text-sm font-black uppercase tracking-[0.34em] text-amber-100">
                        Demo data - not live
                    </div>
                )}
                {isUnavailable && (
                    <div className="mb-5 flex items-center justify-center border border-red-300/45 bg-red-300/14 px-5 py-3 text-center text-sm font-black uppercase tracking-[0.34em] text-red-100">
                        Live market API unavailable
                    </div>
                )}

                <header className="flex shrink-0 items-start justify-between gap-6 pr-32">
                    <div className="min-w-0 flex-1">
                        {isDemo ? (
                            liveData.previewLabel ? (
                                <p className="text-xs font-black uppercase tracking-[0.34em] text-white/45">
                                    {liveData.previewLabel}
                                </p>
                            ) : null
                        ) : liveData.regionLabel ? (
                            <p className="text-xs font-black uppercase tracking-[0.34em] text-white/45">
                                {liveData.regionLabel}
                            </p>
                        ) : null}
                        <h1 className="text-[clamp(34px,5vw,78px)] font-black leading-none tracking-normal">
                            {liveData.marketName.toUpperCase()} {phaseSuffixes[liveData.phase]}
                        </h1>
                    </div>
                    <div className="min-w-[280px] border-l border-white/20 pl-6 text-right">
                        <p
                            className={`text-sm font-black uppercase tracking-[0.22em] ${marketTone}`}
                        >
                            {liveData.nextBellLabel}
                        </p>
                        <div className="mt-1 font-mono text-[clamp(32px,3.8vw,62px)] font-black leading-none tabular-nums">
                            {formatDuration(remaining)}
                        </div>
                        <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                            {liveData.marketTimezone}
                        </p>
                    </div>
                </header>

                <section className="mt-5 grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                    {liveData.instruments.map((instrument) => (
                        <IndexCard key={instrument.id} instrument={instrument} />
                    ))}
                </section>
            </div>
        </motion.div>
    );
}

function IndexCard({ instrument }: { instrument: MarketIndex }) {
    const direction = (instrument.changePercent ?? instrument.change ?? 0) >= 0 ? 'up' : 'down';
    const directionClass = direction === 'up' ? 'text-emerald-300' : 'text-red-300';

    return (
        <article className="flex min-h-0 min-w-0 flex-col justify-between overflow-hidden border border-white/12 bg-white/[0.055] p-4 shadow-2xl">
            <div className="min-h-0">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <h2
                            className="text-[clamp(22px,2vw,36px)] font-black leading-[0.98]"
                            style={{
                                display: '-webkit-box',
                                WebkitBoxOrient: 'vertical',
                                WebkitLineClamp: 2,
                                overflow: 'hidden',
                            }}
                        >
                            {instrument.label}
                        </h2>
                        <p className="mt-2 text-xs font-black uppercase tracking-[0.18em] text-white/40">
                            {instrument.symbol}
                        </p>
                    </div>
                    <span
                        className={`shrink-0 border px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em] ${
                            direction === 'up'
                                ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-200'
                                : 'border-red-300/35 bg-red-300/10 text-red-200'
                        }`}
                    >
                        {direction === 'up' ? 'Up' : 'Down'}
                    </span>
                </div>

                <div className="mt-4">
                    {instrument.price ? (
                        <p className="font-mono text-[clamp(32px,3.4vw,58px)] font-black leading-none tabular-nums">
                            {formatPrice(instrument.price)}
                        </p>
                    ) : (
                        <p className="text-[clamp(22px,2.2vw,36px)] font-black uppercase text-white/35">
                            Data unavailable
                        </p>
                    )}
                    <p
                        className={`mt-3 font-mono text-[clamp(18px,1.85vw,30px)] font-black tabular-nums ${directionClass}`}
                    >
                        {formatSigned(instrument.change)} ·{' '}
                        {formatPercent(instrument.changePercent)}
                    </p>
                </div>
            </div>

            <div className="mt-3 shrink-0">
                <Sparkline
                    points={instrument.points}
                    direction={direction}
                    hasValue={Boolean(instrument.price)}
                />
            </div>
        </article>
    );
}

function Sparkline({
    points,
    direction,
    hasValue,
}: {
    points: MarketIndex['points'];
    direction: 'up' | 'down';
    hasValue: boolean;
}) {
    const gradientId = useId().replace(/:/g, '');
    const geometry = useMemo(
        () => sparklineGeometry(points, direction, hasValue),
        [points, direction, hasValue],
    );
    const stroke =
        direction === 'up' ? usMarketOpenSlide.sparklineUp : usMarketOpenSlide.sparklineDown;

    return (
        <svg
            viewBox="0 0 240 72"
            className="block h-[62px] w-full min-w-0 overflow-visible"
            preserveAspectRatio="none"
            role="img"
            aria-label="Recent movement"
        >
            <defs>
                <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity="0.55" />
                    <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path
                d="M0 62 L240 62"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
            />
            <path d={geometry.areaPath} fill={`url(#${gradientId})`} />
            <path
                d={geometry.linePath}
                fill="none"
                stroke={geometry.hasSignal ? stroke : 'rgba(255,255,255,0.18)'}
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}

function sparklineGeometry(
    points: MarketIndex['points'],
    direction: 'up' | 'down',
    hasValue: boolean,
) {
    if (!hasValue) {
        return {
            linePath: 'M0 34 L240 34',
            areaPath: 'M0 34 L240 34 L240 72 L0 72 Z',
            hasSignal: false,
        };
    }

    if (points.length < 2) {
        const linePath = direction === 'up' ? 'M0 44 L240 20' : 'M0 20 L240 44';

        return {
            linePath,
            areaPath: `${linePath} L240 72 L0 72 Z`,
            hasSignal: true,
        };
    }
    const chartPoints = densifySparklinePoints(points);
    const prices = chartPoints.map((point) => point.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const spread = max - min || 1;
    const commands = chartPoints
        .map((point, index) => {
            const x = (index / (chartPoints.length - 1)) * 240;
            const y = 50 - ((point.price - min) / spread) * 38;

            return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');

    return {
        linePath: commands,
        areaPath: `${commands} L240 72 L0 72 Z`,
        hasSignal: true,
    };
}

function densifySparklinePoints(points: MarketIndex['points']) {
    const maxSegments = 3;

    return points.flatMap((point, index) => {
        const next = points[index + 1];

        if (!next) {
            return [point];
        }

        return Array.from({ length: maxSegments }, (_, segmentIndex) => {
            const t = segmentIndex / maxSegments;

            return {
                timestamp: point.timestamp,
                price: point.price + (next.price - point.price) * t,
            };
        });
    });
}

function formatDuration(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatPrice(value: number) {
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: value >= 100 ? 2 : 3,
        minimumFractionDigits: value >= 100 ? 2 : 3,
    }).format(value);
}

function formatSigned(value: number | null) {
    if (value === null) {
        return 'N/A';
    }
    const sign = value >= 0 ? '+' : '';

    return `${sign}${value.toFixed(2)}`;
}

function formatPercent(value: number | null) {
    if (value === null) {
        return 'N/A';
    }
    const sign = value >= 0 ? '+' : '';

    return `${sign}${value.toFixed(2)}%`;
}

export type UsMarketOpenSlideProps = {
    data: MarketOpenData;
};

export function UsMarketOpenSlide({ data }: UsMarketOpenSlideProps) {
    return <MarketOpenSlide data={data} endpoint="/api/slide-data/us-market-open" />;
}

export function JapanMarketOpenSlide({ data }: UsMarketOpenSlideProps) {
    return <MarketOpenSlide data={data} endpoint="/api/slide-data/japan-market-open" />;
}

export function UkMarketOpenSlide({ data }: UsMarketOpenSlideProps) {
    return <MarketOpenSlide data={data} endpoint="/api/slide-data/uk-market-open" />;
}

export function ChinaMarketOpenSlide({ data }: UsMarketOpenSlideProps) {
    return <MarketOpenSlide data={data} endpoint="/api/slide-data/china-market-open" />;
}

export function SaudiMarketOpenSlide({ data }: UsMarketOpenSlideProps) {
    return <MarketOpenSlide data={data} endpoint="/api/slide-data/saudi-market-open" />;
}
