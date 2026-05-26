import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GoldSlide, type GoldSlideProps } from './GoldSlide';

import type { MarketsSatsData } from '@/lib/slides/types';

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
            <div {...rest}>{children}</div>
        ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const baseData: MarketsSatsData = {
    btcUsd: 95_000,
    timestamp: '2024-01-01T00:00:00Z',
    metals: {
        gold: { usd: 2300, sats: 2_421_052, change24hPct: 0.45 },
        silver: { usd: 28, sats: 29_473, change24hPct: -0.12 },
    },
    oil: {
        wti: { usd: 75, sats: 78_947, change24hPct: 1.1 },
        brent: { usd: 80, sats: 84_210, change24hPct: 0.8 },
    },
    copper: { usd: 4.2, sats: 4_421, change24hPct: null },
    fx: {
        EUR: { usdPerUnit: 1.08, satsPerUnit: 113_684 },
        JPY: { usdPerUnit: 0.0067, satsPerUnit: 705 },
        GBP: { usdPerUnit: 1.27, satsPerUnit: 133_684 },
        USD: { usdPerUnit: 1.0, satsPerUnit: 105_263 },
    },
};

describe('GoldSlide', () => {
    it('renders the GOLD header', () => {
        const props: GoldSlideProps = { data: baseData };
        render(<GoldSlide {...props} />);
        expect(screen.getByText(/GOLD \(XAU\) - SATS PER TROY OUNCE/i)).toBeInTheDocument();
    });

    it('renders gold price data when usd is greater than zero', () => {
        render(<GoldSlide data={baseData} />);
        expect(screen.getByText(/2,300\.00/)).toBeInTheDocument();
    });

    it('renders DATA UNAVAILABLE when gold usd is zero', () => {
        const noData: MarketsSatsData = {
            ...baseData,
            metals: {
                ...baseData.metals,
                gold: { usd: 0, sats: 0, change24hPct: null },
            },
        };
        render(<GoldSlide data={noData} />);
        expect(screen.getByText('DATA UNAVAILABLE')).toBeInTheDocument();
    });
});
