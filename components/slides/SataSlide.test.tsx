import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SataSlide, type SataSlideProps } from './SataSlide';

import type { SataData } from '@/lib/slides/types';

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
            <div {...rest}>{children}</div>
        ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const baseData: SataData = {
    preferred: {
        ticker: 'MSFO',
        name: 'MicroStrategy Preferred',
        price: 85.5,
        priceChange: 0.5,
        priceChangePercent: 0.59,
        volume: 120_000,
        previousClose: 85.0,
    },
    btc: { price: 95_000 },
    metrics: {
        monthlyDiv: 0.6,
        annualDiv: 7.2,
        monthlyDivBtc: 0.0000063,
        annualDivBtc: 0.0000758,
        effYield: 8.4,
        marketCap: 850_000_000,
        sharesOutstanding: 10_000_000,
        nextPayoutDate: '2099-12-15',
        nextRecordDate: '2099-12-10',
        companyName: 'MicroStrategy',
        yearHigh: 95.0,
        yearLow: 72.0,
        avgVolume30D: 150_000,
    },
    lastUpdate: '2024-01-01T12:00:00Z',
};

describe('SataSlide', () => {
    it('renders no-data state when preferred is null', () => {
        const props: SataSlideProps = {
            data: { ...baseData, preferred: null },
        };
        render(<SataSlide {...props} />);
        expect(screen.getByText('No SATA data available')).toBeInTheDocument();
    });

    it('renders the SATA ticker label when preferred data is present', () => {
        const props: SataSlideProps = { data: baseData };
        render(<SataSlide {...props} />);
        expect(screen.getByText('SATA')).toBeInTheDocument();
    });

    it('renders the STANDBY label when next payout date is not today', () => {
        render(<SataSlide data={baseData} />);
        expect(screen.getByText('STANDBY')).toBeInTheDocument();
    });
});
