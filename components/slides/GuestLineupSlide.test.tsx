import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GuestLineupSlide, type GuestLineupSlideProps } from './GuestLineupSlide';

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
            <div {...rest}>{children}</div>
        ),
    },
}));

const data: GuestLineupSlideProps['data'] = {
    mode: 'live',
    updatedAt: '2026-05-22T14:00:00Z',
    rotationSeconds: 9,
    cacheSeconds: 30,
    source: 'Supabase guests',
    guests: [
        {
            id: 'guest-1',
            name: 'Jane Doe',
            role: 'Market Strategist',
            company: 'RTV Research',
            host: 'Desk',
            program: 'Opening Bell',
            category: 'markets',
            appearanceAt: '2026-05-22T15:30:00Z',
            photoUrl: null,
            videoUrl: null,
            color: '#f7931a',
            sortOrder: 1,
        },
        {
            id: 'guest-2',
            name: 'John Smith',
            role: 'Policy Analyst',
            company: 'Policy Lab',
            host: 'Desk',
            program: 'Policy Desk',
            category: 'policy',
            appearanceAt: null,
            photoUrl: null,
            videoUrl: null,
            color: '#93c5fd',
            sortOrder: 2,
        },
    ],
};

describe('GuestLineupSlide', () => {
    it('renders the active guest and upcoming queue', () => {
        vi.stubGlobal('fetch', vi.fn());
        render(<GuestLineupSlide data={data} />);

        expect(screen.getByText('Guest lineup')).toBeInTheDocument();
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        expect(screen.getByText('Market Strategist · RTV Research')).toBeInTheDocument();
        expect(screen.getByText('John Smith')).toBeInTheDocument();
        expect(screen.getByText('Supabase guests · cache 30s')).toBeInTheDocument();
    });

    it('marks demo mode clearly', () => {
        vi.stubGlobal('fetch', vi.fn());
        render(<GuestLineupSlide data={{ ...data, mode: 'demo', source: 'Demo guests' }} />);

        expect(screen.getByText('Demo guests')).toBeInTheDocument();
    });

    it('uses guest video as hero media when available', () => {
        vi.stubGlobal('fetch', vi.fn());
        const videoData = {
            ...data,
            guests: [{ ...data.guests[0]!, videoUrl: 'https://example.com/guest.mp4' }],
        };
        const { container } = render(<GuestLineupSlide data={videoData} />);

        expect(container.querySelector('video')?.getAttribute('src')).toBe(
            'https://example.com/guest.mp4',
        );
    });
});
