'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { formatBTC, formatBTCMain } from '@/lib/slides/fmt';
import type { DebtData } from '@/lib/slides/types';

export type DebtSlideProps = {
    data: DebtData;
};

const FALLBACK_POPULATION = 341_784_857;
const FALLBACK_TAX_RETURNS = 163_146_000;
const FALLBACK_DEBT_GDP_HISTORY = [
    { year: '1960', pct: 53.6 },
    { year: '1980', pct: 31.2 },
    { year: '2000', pct: 55.9 },
];

const headerFont = { fontSize: 'clamp(27px, 2vw, 39px)', lineHeight: '1', fontWeight: 900 };
const valueFont = { fontSize: 'clamp(32px, 3vw, 56px)', lineHeight: '1', fontWeight: 900 };
const headerPadding = 'px-4 py-4';
const contentPadding = 'px-6 py-10';
const headerBg = 'bg-red-500/80';
const contentBg = 'bg-zinc-900/80';

function LiveCounter({
    base,
    perSecond,
    btcPrice,
}: {
    base: number;
    perSecond: number;
    btcPrice: number;
}) {
    const [current, setCurrent] = useState(base);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrent((prev) => prev + perSecond);
        }, 1000);

        return () => clearInterval(interval);
    }, [perSecond]);

    return (
        <div className="text-white tabular-nums text-center whitespace-nowrap" style={valueFont}>
            {formatBTCMain(current / btcPrice)}
        </div>
    );
}

export function DebtSlide({ data }: DebtSlideProps) {
    const btcPrice = data.btcPriceUsd > 0 ? data.btcPriceUsd : 95000;
    const population =
        data.population && data.population > 0 ? data.population : FALLBACK_POPULATION;
    const taxReturns =
        data.taxReturns && data.taxReturns > 0 ? data.taxReturns : FALLBACK_TAX_RETURNS;
    const debtPerCitizenBTC = data.liveEstimateNow / population / btcPrice;
    const debtPerTaxReturnBTC = data.liveEstimateNow / taxReturns / btcPrice;
    const annualFederalSpendingBTC = data.annualFederalSpending / btcPrice;
    const annualBudgetDeficitBTC = data.annualBudgetDeficit / btcPrice;
    const debtGdpHistory = data.debtGdpHistory?.length
        ? data.debtGdpHistory
        : FALLBACK_DEBT_GDP_HISTORY;
    const debtGdpNow =
        data.debtGdpNowPct ??
        (data.gdpUsd && data.gdpUsd > 0 ? (data.liveEstimateNow / data.gdpUsd) * 100 : null);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="h-full w-full bg-black"
        >
            <div className="w-full h-full flex flex-col gap-6 p-8 justify-center bg-transparent relative">
                <div
                    className="absolute inset-0 z-0 overflow-hidden opacity-80 pointer-events-none"
                    aria-hidden="true"
                >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(239,68,68,0.24),transparent_34%),linear-gradient(135deg,#080808_0%,#151515_48%,#050505_100%)]" />
                    <div className="absolute left-1/2 top-1/2 h-[72%] w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-[45%_55%_48%_52%] border-[18px] border-white/18 bg-white/[0.03] shadow-[0_0_80px_rgba(255,255,255,0.18)]" />
                    <div className="absolute left-[16%] top-[35%] h-[22%] w-[26%] rotate-[-12deg] rounded-[50%] border-[10px] border-white/16" />
                    <div className="absolute right-[16%] top-[36%] h-[24%] w-[24%] rotate-[16deg] rounded-[50%] border-[10px] border-white/16" />
                    <div className="absolute left-[42%] top-[24%] h-[56%] w-[16%] rotate-[4deg] rounded-full border-[10px] border-white/14" />
                    <div className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-white/14" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[18rem] font-black leading-none tracking-[0.16em] text-white/[0.055]">
                            USA
                        </span>
                    </div>
                </div>

                <div className="relative z-10 flex flex-col gap-6 w-full h-full justify-center">
                    <div className="grid grid-cols-3 gap-6 w-full">
                        <div className="flex flex-col shadow-xl">
                            <div
                                className={`${headerBg} flex items-center justify-center ${headerPadding} h-32`}
                            >
                                <h2
                                    className="text-white text-center tracking-wider uppercase"
                                    style={headerFont}
                                >
                                    US NATIONAL DEBT (Estimated BTC Needed at Current Price)
                                </h2>
                            </div>
                            <div
                                className={`flex flex-col items-center justify-center flex-1 ${contentBg} ${contentPadding}`}
                            >
                                <LiveCounter
                                    key={`${data.liveEstimateNow}-${btcPrice}`}
                                    base={data.liveEstimateNow}
                                    perSecond={data.perSecond}
                                    btcPrice={btcPrice}
                                />
                                <div className="mt-2 text-center text-xs font-semibold uppercase tracking-wider text-white/55">
                                    Latest Treasury data {formatDateLabel(data.debtAsOf)}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col shadow-xl">
                            <div
                                className={`${headerBg} flex items-center justify-center ${headerPadding} h-32`}
                            >
                                <h3
                                    className="text-white text-center tracking-wider uppercase"
                                    style={headerFont}
                                >
                                    DEBT PER PERSON
                                </h3>
                            </div>
                            <div
                                className={`flex flex-col items-center justify-center flex-1 ${contentBg} ${contentPadding}`}
                            >
                                <div
                                    className="text-white tabular-nums text-center"
                                    style={valueFont}
                                >
                                    {formatBTC(debtPerCitizenBTC)}
                                </div>
                                <div className="mt-2 text-center text-xs font-semibold uppercase tracking-wider text-white/55">
                                    Population {formatCompactNumber(population)} ·{' '}
                                    {data.populationAsOf ?? 'fallback'}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col shadow-xl">
                            <div
                                className={`${headerBg} flex items-center justify-center ${headerPadding} h-32`}
                            >
                                <h3
                                    className="text-white text-center tracking-wider uppercase"
                                    style={headerFont}
                                >
                                    DEBT PER TAX RETURN
                                </h3>
                            </div>
                            <div
                                className={`flex flex-col items-center justify-center flex-1 ${contentBg} ${contentPadding}`}
                            >
                                <div
                                    className="text-white tabular-nums text-center"
                                    style={valueFont}
                                >
                                    {formatBTC(debtPerTaxReturnBTC)}
                                </div>
                                <div className="mt-2 text-center text-xs font-semibold uppercase tracking-wider text-white/55">
                                    IRS returns {formatCompactNumber(taxReturns)} ·{' '}
                                    {data.taxReturnsAsOf ?? 'fallback'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 w-full">
                        <div className="flex flex-col shadow-xl">
                            <div
                                className={`${headerBg} flex items-center justify-center ${headerPadding}`}
                            >
                                <h3
                                    className="text-white text-center tracking-wider uppercase"
                                    style={headerFont}
                                >
                                    US FEDERAL SPENDING (OFFICIAL FY TOTAL)
                                </h3>
                            </div>
                            <div
                                className={`flex flex-col items-center justify-center flex-1 ${contentBg} ${contentPadding}`}
                            >
                                <div
                                    className="text-white tabular-nums text-center"
                                    style={valueFont}
                                >
                                    {annualFederalSpendingBTC > 0
                                        ? formatBTC(annualFederalSpendingBTC)
                                        : 'N/A'}
                                </div>
                                <div className="text-white/60 text-xs sm:text-sm mt-2 text-center uppercase tracking-wider font-medium">
                                    Source: U.S. Treasury MTS (FiscalData.gov) — Last Full FY
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col shadow-xl">
                            <div
                                className={`${headerBg} flex items-center justify-center ${headerPadding}`}
                            >
                                <h3
                                    className="text-white text-center tracking-wider uppercase"
                                    style={headerFont}
                                >
                                    US FEDERAL BUDGET DEFICIT (OFFICIAL FY TOTAL)
                                </h3>
                            </div>
                            <div
                                className={`flex flex-col items-center justify-center flex-1 ${contentBg} ${contentPadding}`}
                            >
                                <div
                                    className="text-white tabular-nums text-center"
                                    style={valueFont}
                                >
                                    {annualBudgetDeficitBTC > 0
                                        ? formatBTC(annualBudgetDeficitBTC)
                                        : 'N/A'}
                                </div>
                                <div className="text-white/60 text-xs sm:text-sm mt-2 text-center uppercase tracking-wider font-medium">
                                    Source: U.S. Treasury MTS (FiscalData.gov) — Last Full FY
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col shadow-xl">
                        <div
                            className={`${headerBg} flex items-center justify-center ${headerPadding}`}
                        >
                            <h3
                                className="text-white text-center tracking-wider uppercase"
                                style={headerFont}
                            >
                                US FEDERAL DEBT TO GDP RATIO
                            </h3>
                        </div>
                        <div
                            className={`flex items-center justify-between px-12 py-6 flex-1 ${contentBg}`}
                        >
                            {(
                                [
                                    ...debtGdpHistory.map((item) => [
                                        item.year,
                                        `${item.pct.toFixed(2)}%`,
                                    ]),
                                    [
                                        'NOW',
                                        debtGdpNow !== null ? `${debtGdpNow.toFixed(2)}%` : 'N/A',
                                    ],
                                ] as [string, string][]
                            ).map(([label, value]) => (
                                <div key={label} className="flex items-center gap-4">
                                    <span className="text-white text-3xl font-bold">{label}</span>
                                    <div className="bg-white px-4 py-2 min-w-[140px] flex justify-center">
                                        <span className="text-red-600 text-3xl font-black">
                                            {value}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                        <span>Estimated live from latest Treasury data</span>
                        <span>
                            BTC {formatUsd(btcPrice)} · {data.btcPriceSource ?? 'fallback'}
                            {data.stale ? ' · stale' : ''}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

function formatDateLabel(value: string | undefined) {
    if (!value) {
        return 'unavailable';
    }
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toISOString().slice(0, 10);
}

function formatCompactNumber(value: number) {
    return new Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value);
}

function formatUsd(value: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(value);
}
