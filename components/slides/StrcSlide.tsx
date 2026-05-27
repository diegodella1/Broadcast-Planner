'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { priceSlide } from '@/lib/slides/palette';
import type { StrcData } from '@/lib/slides/types';

export type StrcSlideProps = {
    data: StrcData;
};

const MONO = "var(--font-ibm-plex-mono), 'IBM Plex Mono', monospace";
const SANS = "'Inter', sans-serif";

const BTC_FMT = (n: number) => n.toFixed(8) + ' ₿';
const USD_FMT = (n: number, d = 2) =>
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const toBtc = (usd: number, btcPrice: number) => (btcPrice > 0 ? usd / btcPrice : 0);

interface StatItem {
    l: string;
    v: string;
    u?: string | undefined;
    c?: string | undefined;
}

const StatCell = React.memo(({ stat, index }: { stat: StatItem; index: number }) => (
    <div
        style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
            padding: '16px 12px',
            borderRight: (index + 1) % 4 === 0 ? 'none' : `1px solid ${priceSlide.borderSubtle}`,
            borderBottom: index < 8 ? `1px solid ${priceSlide.borderSubtle}` : 'none',
        }}
    >
        <div
            style={{
                fontFamily: SANS,
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: priceSlide.textMuted,
                marginBottom: 6,
            }}
        >
            {stat.l}
        </div>
        <div
            style={{
                fontFamily: MONO,
                fontSize: 34,
                fontWeight: 700,
                lineHeight: 1.2,
                color:
                    stat.c === 'gold'
                        ? priceSlide.accentGold
                        : stat.c === 'green'
                          ? priceSlide.accentGreen
                          : priceSlide.textPrimary,
            }}
        >
            {stat.v}
        </div>
        {stat.u && (
            <div
                style={{
                    fontFamily: MONO,
                    fontSize: 24,
                    color: priceSlide.accentGreen,
                    marginTop: 2,
                }}
            >
                {stat.u}
            </div>
        )}
    </div>
));
StatCell.displayName = 'StatCell';

const StatsGrid = React.memo(({ stats }: { stats: StatItem[] }) => (
    <div
        style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: '1fr 1fr 1fr',
            flexShrink: 0,
            borderBottom: `1px solid ${priceSlide.borderSubtle}`,
        }}
    >
        {stats.map((st, i) => (
            <StatCell key={st.l} stat={st} index={i} />
        ))}
    </div>
));
StatsGrid.displayName = 'StatsGrid';

const TopBar = React.memo(
    ({
        priceBtc,
        priceUsd,
        changeBtc,
        isUp,
        btcPrice,
        flash,
    }: {
        priceBtc: string;
        priceUsd: string;
        changeBtc: string;
        isUp: boolean;
        btcPrice: string;
        flash: 'up' | 'down' | null;
    }) => (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 40px',
                height: 90,
                borderBottom: `1px solid ${priceSlide.borderSubtle}`,
                flexShrink: 0,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <span
                    style={{
                        fontFamily: MONO,
                        fontSize: 44,
                        fontWeight: 700,
                        letterSpacing: 6,
                        color: priceSlide.accentGold,
                    }}
                >
                    STRC
                </span>
                <div style={{ width: 1, height: 40, background: priceSlide.borderSubtle }} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                    <span
                        style={{
                            fontFamily: MONO,
                            fontSize: 48,
                            fontWeight: 700,
                            color:
                                flash === 'up'
                                    ? priceSlide.accentGreen
                                    : flash === 'down'
                                      ? priceSlide.accentRed
                                      : priceSlide.textPrimary,
                            transition: flash ? 'none' : 'color 1.5s',
                        }}
                    >
                        {priceBtc}
                    </span>
                    <span
                        style={{
                            fontFamily: MONO,
                            fontSize: 48,
                            fontWeight: 600,
                            color: priceSlide.accentGreen,
                        }}
                    >
                        {priceUsd}
                    </span>
                    <span
                        style={{
                            fontFamily: MONO,
                            fontSize: 32,
                            fontWeight: 600,
                            color: isUp ? priceSlide.accentGreen : priceSlide.accentRed,
                        }}
                    >
                        {changeBtc}
                    </span>
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontFamily: MONO, fontSize: 36, color: priceSlide.textMuted }}>
                    BTC{' '}
                    <span style={{ color: priceSlide.textSubtle, fontWeight: 600 }}>
                        {btcPrice}
                    </span>
                </span>
                <div
                    style={{
                        width: 8,
                        height: 8,
                        background: priceSlide.accentGreen,
                        borderRadius: '50%',
                    }}
                />
            </div>
        </div>
    ),
);
TopBar.displayName = 'TopBar';

const AtmSection = React.memo(
    ({
        isActive,
        atmBtc,
        atmUsd,
        nextLabel,
    }: {
        isActive: boolean;
        atmBtc: string;
        atmUsd: string;
        nextLabel: string;
    }) => (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                borderBottom: `1px solid ${priceSlide.borderSubtle}`,
                minHeight: 0,
            }}
        >
            <div
                style={{
                    fontFamily: MONO,
                    fontSize: 52,
                    fontWeight: 700,
                    letterSpacing: 8,
                    color: priceSlide.accentGold,
                    marginBottom: 16,
                }}
            >
                TODAY&apos;S ATM
            </div>
            <div
                style={{
                    fontFamily: MONO,
                    fontSize: 38,
                    fontWeight: 700,
                    letterSpacing: 4,
                    padding: '8px 32px',
                    borderRadius: 8,
                    marginBottom: 20,
                    color: isActive ? priceSlide.accentGreen : priceSlide.accentGold,
                    border: isActive
                        ? '1px solid rgba(34,197,94,0.4)'
                        : '1px solid rgba(251,191,36,0.3)',
                    background: isActive ? 'rgba(34,197,94,0.06)' : 'rgba(251,191,36,0.04)',
                }}
            >
                {isActive ? 'ACTIVE' : 'STANDBY'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 }}>
                <span
                    style={{
                        fontFamily: MONO,
                        fontSize: 110,
                        fontWeight: 700,
                        color: priceSlide.accentGold,
                        lineHeight: 1,
                    }}
                >
                    {atmBtc}
                </span>
                <span
                    style={{
                        fontFamily: MONO,
                        fontSize: 72,
                        color: priceSlide.textMuted,
                        fontWeight: 300,
                    }}
                >
                    /
                </span>
                <span
                    style={{
                        fontFamily: MONO,
                        fontSize: 110,
                        fontWeight: 700,
                        color: priceSlide.accentGreen,
                    }}
                >
                    {atmUsd}
                </span>
            </div>
            {nextLabel && (
                <div
                    style={{
                        fontFamily: MONO,
                        fontSize: 26,
                        color: priceSlide.textMuted,
                        marginTop: 16,
                    }}
                >
                    {nextLabel}
                </div>
            )}
        </div>
    ),
);
AtmSection.displayName = 'AtmSection';

const SlideFooter = React.memo(({ time }: { time: string }) => (
    <div
        style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0 56px',
            height: 24,
            flexShrink: 0,
        }}
    >
        <span style={{ fontFamily: MONO, fontSize: 11, color: priceSlide.textMuted }}>
            Updated {time}
        </span>
    </div>
));
SlideFooter.displayName = 'SlideFooter';

export function StrcSlide({
    data,
    flash = null,
}: StrcSlideProps & { flash?: 'up' | 'down' | null }) {
    const display = useMemo(() => {
        const { strc, btc, dividends, metrics, lastUpdate } = data;
        const b = btc.price;
        const s = toBtc(strc.price, b);
        const ps = toBtc(strc.previousClose, b);
        const diff = s - ps;
        const sign = diff >= 0 ? '+' : '';
        const isUp = diff >= 0;

        const today = new Date().toISOString().slice(0, 10);
        const todayDiv = dividends.find((x) => x.payDate === today);
        const isActive = !!todayDiv;
        const atmBtcVal = isActive
            ? (todayDiv.btc ?? toBtc(todayDiv.usd, b))
            : toBtc(metrics.monthlyDiv, b);
        const atmUsdVal = isActive ? todayDiv.usd : metrics.monthlyDiv;

        let nextLabel = '';

        if (!isActive && metrics.nextPayoutDate) {
            const days = Math.ceil(
                (new Date(metrics.nextPayoutDate).getTime() - new Date(today).getTime()) / 86400000,
            );
            nextLabel = `Next payout: ${metrics.nextPayoutDate} (${days}d)`;
        }

        const cor = metrics.correlations;
        const stats: StatItem[] = [
            {
                l: 'Par Value',
                v: BTC_FMT(toBtc(metrics.parValue, b)),
                u: USD_FMT(metrics.parValue),
                c: 'gold',
            },
            { l: 'Eff. Yield', v: (metrics.effYield ?? 0).toFixed(2) + '%', c: 'green' },
            {
                l: 'Monthly Div',
                v: BTC_FMT(metrics.monthlyDivBtc ?? toBtc(metrics.monthlyDiv, b)),
                u: USD_FMT(metrics.monthlyDiv, 4),
                c: 'gold',
            },
            {
                l: 'Annual Div',
                v: BTC_FMT(metrics.annualDivBtc ?? toBtc(metrics.annualDiv, b)),
                u: USD_FMT(metrics.annualDiv, 2),
                c: 'gold',
            },
            {
                l: 'Market Cap',
                v: metrics.marketCap != null ? (metrics.marketCap / b).toFixed(0) + ' BTC' : '—',
                u: metrics.marketCap != null ? USD_FMT(metrics.marketCap, 0) : undefined,
            },
            { l: 'Volume', v: strc.volume != null ? strc.volume.toLocaleString('en-US') : '—' },
            {
                l: 'Shares',
                v:
                    metrics.sharesOutstanding != null
                        ? (metrics.sharesOutstanding / 1e6).toFixed(2) + 'M'
                        : '—',
            },
            { l: 'MSTR', v: metrics.mstrPrice ? USD_FMT(metrics.mstrPrice) : '—' },
            {
                l: 'Sharpe',
                v: metrics.sharpeRatio != null ? metrics.sharpeRatio.toFixed(2) : '—',
                c: 'green',
            },
            {
                l: 'Ann. Vol',
                v: metrics.annualizedVolatility != null ? metrics.annualizedVolatility + '%' : '—',
            },
            { l: 'VWAP 1M', v: metrics.vwap1mo != null ? USD_FMT(metrics.vwap1mo, 2) : '—' },
            { l: 'Corr', v: cor ? `M${cor.mstr} S${cor.spy} B${cor.btc}` : '—' },
        ];

        const ts = new Date(lastUpdate);

        return {
            priceBtc: BTC_FMT(s),
            priceUsd: USD_FMT(strc.price),
            changeBtc: `${sign}${diff.toFixed(8)} ₿`,
            isUp,
            btcPrice: USD_FMT(b, 0),
            isActive,
            atmBtc: (isActive ? '' : '~') + BTC_FMT(atmBtcVal),
            atmUsd: USD_FMT(atmUsdVal, 4),
            nextLabel,
            stats,
            time: ts.toLocaleTimeString('en-US', { hour12: false }),
        };
    }, [data]);

    return (
        <motion.div
            style={{
                height: '100%',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: priceSlide.bgPrimary,
                color: priceSlide.textPrimary,
                fontFamily: SANS,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <TopBar
                priceBtc={display.priceBtc}
                priceUsd={display.priceUsd}
                changeBtc={display.changeBtc}
                isUp={display.isUp}
                btcPrice={display.btcPrice}
                flash={flash}
            />
            <AtmSection
                isActive={display.isActive}
                atmBtc={display.atmBtc}
                atmUsd={display.atmUsd}
                nextLabel={display.nextLabel}
            />
            <StatsGrid stats={display.stats} />
            <SlideFooter time={display.time} />
        </motion.div>
    );
}
