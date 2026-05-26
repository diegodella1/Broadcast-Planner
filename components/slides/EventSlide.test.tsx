import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EventSlide, type EventSlideProps } from './EventSlide';

import type { CalendarEvent } from '@/lib/slides/types';

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
            <div {...rest}>{children}</div>
        ),
        h1: ({ children, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) => (
            <h1 {...rest}>{children}</h1>
        ),
        p: ({ children, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) => (
            <p {...rest}>{children}</p>
        ),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/image', () => ({
    default: ({ alt, ...rest }: { alt: string; [key: string]: unknown }) => (
        <img alt={alt} {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)} />
    ),
}));

const baseEvent: CalendarEvent = {
    id: 'e1',
    title: 'Bitcoin Summit',
    description: null,
    image_url: null,
    start_date: '2099-06-01',
    end_date: null,
    start_time: null,
    end_time: null,
    is_active: true,
    order_index: 0,
    color: '#F7931A',
    title_font: null,
    title_size: null,
    title_color: null,
    text_color: null,
    overlay_opacity: null,
    show_date_badge: true,
    location: null,
    schedule_times: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
};

describe('EventSlide', () => {
    it('renders empty state when no event IDs are selected', () => {
        const props: EventSlideProps = {
            selectedEventIds: [],
            events: [baseEvent],
        };
        render(<EventSlide {...props} />);
        expect(screen.getByText('No events selected')).toBeInTheDocument();
    });

    it('renders the event title for a single selected event', () => {
        const props: EventSlideProps = {
            selectedEventIds: ['e1'],
            events: [baseEvent],
        };
        render(<EventSlide {...props} />);
        expect(screen.getByText('Bitcoin Summit')).toBeInTheDocument();
    });

    it('renders multiple event titles when two events are selected', () => {
        const events: CalendarEvent[] = [
            baseEvent,
            { ...baseEvent, id: 'e2', title: 'Crypto Conference' },
        ];
        const props: EventSlideProps = {
            selectedEventIds: ['e1', 'e2'],
            events,
        };
        render(<EventSlide {...props} />);
        expect(screen.getByText('Bitcoin Summit')).toBeInTheDocument();
        expect(screen.getByText('Crypto Conference')).toBeInTheDocument();
    });
});
