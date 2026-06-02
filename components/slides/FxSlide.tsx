'use client';

import { motion } from 'framer-motion';
import { formatSats } from '@/lib/slides/fmt';
import { fxSlide } from '@/lib/slides/palette';
import type { MarketsSatsData } from '@/lib/slides/types';
import { useSlidePollingData } from './use-slide-polling-data';

export type FxSlideProps = {
    data: MarketsSatsData;
};

const headerFont = { fontSize: 'clamp(24px, 1.75vw, 34px)', lineHeight: '1', fontWeight: 900 };
const valueFont = { fontSize: 'clamp(28px, 2.45vw, 46px)', lineHeight: '1', fontWeight: 900 };
const headerBg = 'bg-red-500/80';
const contentBg = 'bg-zinc-900/80';

type FlagCountry = 'EUR' | 'JPY' | 'GBP' | 'USD';

function FlagIcon({ country }: { country: FlagCountry }) {
    const size = 'clamp(24px, 2.5vw, 40px)';

    if (country === 'EUR') {
        return (
            <svg
                width={size}
                height={size}
                viewBox="0 0 36 24"
                className="inline-block mr-2"
                style={{ verticalAlign: 'middle' }}
            >
                <rect width="36" height="24" fill={fxSlide.euBlue} />
                <circle cx="18" cy="12" r="8" fill={fxSlide.euYellow} />
                <circle cx="18" cy="12" r="6" fill={fxSlide.euBlue} />
                <circle cx="18" cy="12" r="4" fill={fxSlide.euYellow} />
            </svg>
        );
    }

    if (country === 'JPY') {
        return (
            <svg
                width={size}
                height={size}
                viewBox="0 0 36 24"
                className="inline-block mr-2"
                style={{ verticalAlign: 'middle' }}
            >
                <rect width="36" height="24" fill={fxSlide.white} />
                <circle cx="18" cy="12" r="7" fill={fxSlide.jpRed} />
            </svg>
        );
    }

    if (country === 'GBP') {
        return (
            <svg
                width={size}
                height={size}
                viewBox="0 0 36 24"
                className="inline-block mr-2"
                style={{ verticalAlign: 'middle' }}
            >
                <rect width="36" height="24" fill={fxSlide.ukBlue} />
                <path d="M0 0 L36 24 M36 0 L0 24" stroke={fxSlide.white} strokeWidth="2.4" />
                <path d="M0 12 L36 12 M18 0 L18 24" stroke={fxSlide.white} strokeWidth="4" />
                <path d="M0 0 L36 24 M36 0 L0 24" stroke={fxSlide.ukRed} strokeWidth="1.6" />
                <path d="M0 12 L36 12 M18 0 L18 24" stroke={fxSlide.ukRed} strokeWidth="2.4" />
            </svg>
        );
    }

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 36 24"
            className="inline-block mr-2"
            style={{ verticalAlign: 'middle' }}
        >
            <rect width="36" height="24" fill={fxSlide.usRed} />
            <rect width="36" height="2.67" fill={fxSlide.white} y="2.67" />
            <rect width="36" height="2.67" fill={fxSlide.white} y="5.34" />
            <rect width="36" height="2.67" fill={fxSlide.white} y="8.01" />
            <rect width="36" height="2.67" fill={fxSlide.white} y="10.68" />
            <rect width="36" height="2.67" fill={fxSlide.white} y="13.35" />
            <rect width="36" height="2.67" fill={fxSlide.white} y="16.02" />
            <rect width="36" height="2.67" fill={fxSlide.white} y="18.69" />
            <rect width="36" height="2.67" fill={fxSlide.white} y="21.36" />
            <rect width="14.4" height="10.67" fill={fxSlide.usCanton} x="0" y="0" />
            <circle cx="3.6" cy="2.67" r="0.8" fill={fxSlide.white} />
            <circle cx="7.2" cy="2.67" r="0.8" fill={fxSlide.white} />
            <circle cx="10.8" cy="2.67" r="0.8" fill={fxSlide.white} />
            <circle cx="5.4" cy="4.67" r="0.8" fill={fxSlide.white} />
            <circle cx="9" cy="4.67" r="0.8" fill={fxSlide.white} />
        </svg>
    );
}

export function FxSlide({ data }: FxSlideProps) {
    const liveData = useSlidePollingData(data, '/api/slide-data/markets');
    const { fx } = liveData;
    const currencies: Array<{ code: FlagCountry; name: string; satsPerUnit: number }> = [
        { code: 'EUR', name: 'Euro', satsPerUnit: fx.EUR.satsPerUnit },
        { code: 'JPY', name: 'Japanese Yen', satsPerUnit: fx.JPY.satsPerUnit },
        { code: 'GBP', name: 'British Pound', satsPerUnit: fx.GBP.satsPerUnit },
        { code: 'USD', name: 'US Dollar', satsPerUnit: fx.USD.satsPerUnit },
    ];

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
                    style={{ filter: 'drop-shadow(0 0 3px white)', transform: 'scale(2)' }}
                >
                    <g transform="translate(200, 200)">
                        <circle
                            cx="0"
                            cy="0"
                            r="80"
                            fill="none"
                            stroke={fxSlide.globeStroke}
                            strokeWidth="4"
                            opacity="0.5"
                        />
                        <ellipse
                            cx="0"
                            cy="0"
                            rx="80"
                            ry="40"
                            fill="none"
                            stroke={fxSlide.globeStroke}
                            strokeWidth="2"
                            opacity="0.4"
                        />
                        <ellipse
                            cx="0"
                            cy="0"
                            rx="80"
                            ry="20"
                            fill="none"
                            stroke={fxSlide.globeStroke}
                            strokeWidth="2"
                            opacity="0.4"
                        />
                        <path
                            d="M 0 -80 Q 40 0 0 80"
                            fill="none"
                            stroke={fxSlide.globeStroke}
                            strokeWidth="2"
                            opacity="0.4"
                        />
                        <path
                            d="M 0 -80 Q -40 0 0 80"
                            fill="none"
                            stroke={fxSlide.globeStroke}
                            strokeWidth="2"
                            opacity="0.4"
                        />
                        {(['$', '€', '£', '¥'] as const).map((sym, i) => {
                            const positions = [
                                { x: 0, y: -120 },
                                { x: 120, y: 0 },
                                { x: 0, y: 120 },
                                { x: -120, y: 0 },
                            ];
                            const labels = ['USD', 'EUR', 'GBP', 'JPY'];
                            const pos = positions[i]!;

                            return (
                                <g key={sym} transform={`translate(${pos.x}, ${pos.y})`}>
                                    <circle
                                        cx="0"
                                        cy="0"
                                        r="30"
                                        fill="none"
                                        stroke={fxSlide.globeStroke}
                                        strokeWidth="3"
                                        opacity="0.6"
                                    />
                                    <text
                                        x="0"
                                        y="8"
                                        textAnchor="middle"
                                        fill={fxSlide.globeStroke}
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
                                        fill={fxSlide.globeStroke}
                                        fontSize="14"
                                        fontWeight="bold"
                                        opacity="0.5"
                                    >
                                        {labels[i]}
                                    </text>
                                </g>
                            );
                        })}
                    </g>
                </svg>
            </div>

            <div className="relative z-10 flex h-full w-full flex-col justify-center">
                <div className="grid h-full max-h-[calc(100vh-4rem)] w-full grid-cols-2 grid-rows-2 gap-5">
                    {currencies.map((currency) => (
                        <div
                            key={currency.code}
                            className="flex min-h-0 flex-col overflow-hidden shadow-xl"
                        >
                            <div
                                className={`${headerBg} flex h-24 shrink-0 items-center justify-center px-4 py-3`}
                            >
                                <h2
                                    className="text-white text-center tracking-wider uppercase"
                                    style={headerFont}
                                >
                                    {currency.code} - SATS PER UNIT
                                </h2>
                            </div>
                            <div
                                className={`flex min-h-0 flex-1 items-center justify-center ${contentBg} px-5 py-6`}
                            >
                                {currency.satsPerUnit > 0 ? (
                                    <div
                                        className="flex min-w-0 items-center justify-center gap-2 whitespace-nowrap text-white tabular-nums"
                                        style={valueFont}
                                    >
                                        <FlagIcon country={currency.code} />
                                        <span>
                                            1 {currency.code} ={' '}
                                            {formatSats(currency.satsPerUnit).number}
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
    );
}
