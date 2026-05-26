import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OilSlide, type OilSlideProps } from './OilSlide';

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
        wti: { usd: 75.5, sats: 79_473, change24hPct: 1.1 },
        brent: { usd: 80.2, sats: 84_421, change24hPct: 0.8 },
    },
    copper: { usd: 4.2, sats: 4_421, change24hPct: null },
    fx: {
        EUR: { usdPerUnit: 1.08, satsPerUnit: 113_684 },
        JPY: { usdPerUnit: 0.0067, satsPerUnit: 705 },
        GBP: { usdPerUnit: 1.27, satsPerUnit: 133_684 },
        USD: { usdPerUnit: 1.0, satsPerUnit: 105_263 },
    },
};

describe('OilSlide', () => {
    it('renders both WTI and BRENT card headers', () => {
        const props: OilSlideProps = { data: baseData };
        render(<OilSlide {...props} />);
        expect(screen.getByText(/WTI CRUDE OIL/i)).toBeInTheDocument();
        expect(screen.getByText(/BRENT CRUDE OIL/i)).toBeInTheDocument();
    });

    it('renders USD prices for both oil types when data is present', () => {
        render(<OilSlide data={baseData} />);
        expect(screen.getByText(/75\.50/)).toBeInTheDocument();
        expect(screen.getByText(/80\.20/)).toBeInTheDocument();
    });

    it('renders DATA UNAVAILABLE for both when usd values are zero', () => {
        const noData: MarketsSatsData = {
            ...baseData,
            oil: {
                wti: { usd: 0, sats: 0, change24hPct: null },
                brent: { usd: 0, sats: 0, change24hPct: null },
            },
        };
        render(<OilSlide data={noData} />);
        const unavailable = screen.getAllByText('DATA UNAVAILABLE');
        expect(unavailable).toHaveLength(2);
    });
});
