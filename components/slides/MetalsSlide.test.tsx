import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MetalsSlide, type MetalsSlideProps } from './MetalsSlide';

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

describe('MetalsSlide', () => {
    it('renders all four commodity card headers', () => {
        const props: MetalsSlideProps = { data: baseData };
        render(<MetalsSlide {...props} />);
        expect(screen.getByText(/GOLD \(XAU\)/i)).toBeInTheDocument();
        expect(screen.getByText(/SILVER \(XAG\)/i)).toBeInTheDocument();
        expect(screen.getByText(/OIL \(WTI\)/i)).toBeInTheDocument();
        expect(screen.getByText(/ISHARES COPPER/i)).toBeInTheDocument();
    });

    it('renders em-dash placeholders when all commodity values are zero', () => {
        const noData: MarketsSatsData = {
            ...baseData,
            metals: {
                gold: { usd: 0, sats: 0, change24hPct: null },
                silver: { usd: 0, sats: 0, change24hPct: null },
            },
            oil: {
                wti: { usd: 0, sats: 0, change24hPct: null },
                brent: { usd: 0, sats: 0, change24hPct: null },
            },
            copper: { usd: 0, sats: 0, change24hPct: null },
        };
        render(<MetalsSlide data={noData} />);
        const dashes = screen.getAllByText('—');
        expect(dashes.length).toBeGreaterThanOrEqual(4);
    });
});
