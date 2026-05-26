'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { CalendarEvent } from '@/lib/slides/types';

export type CalendarSlideProps = {
    events: CalendarEvent[];
};

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');

    return {
        day: date.getDate(),
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
    };
};

const formatTime = (timeStr: string | null): string | null => {
    if (!timeStr) {
        return null;
    }
    const parts = timeStr.split(':');
    const hoursStr = parts[0] ?? '0';
    const minutesStr = parts[1] ?? '00';
    const h = parseInt(hoursStr, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;

    return `${hour12}:${minutesStr} ${ampm}`;
};

type EventCardSize = 'large' | 'medium' | 'small';

function EventCard({ event, size }: { event: CalendarEvent; size: EventCardSize }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = formatDate(event.start_date);
    const time = formatTime(event.start_time);
    const eventDate = new Date(event.start_date + 'T00:00:00');
    const todayEvent = eventDate.toDateString() === today.toDateString();

    const sizeClasses: Record<EventCardSize, string> = {
        large: 'p-8',
        medium: 'p-6',
        small: 'p-4',
    };
    const titleClasses: Record<EventCardSize, string> = {
        large: 'text-4xl',
        medium: 'text-2xl',
        small: 'text-xl',
    };
    const dateClasses: Record<EventCardSize, string> = {
        large: 'text-5xl',
        medium: 'text-3xl',
        small: 'text-2xl',
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`relative h-full rounded-2xl overflow-hidden ${sizeClasses[size]}`}
            style={{
                background: event.image_url
                    ? undefined
                    : `linear-gradient(135deg, ${event.color}30 0%, ${event.color}10 100%)`,
                borderLeft: `4px solid ${event.color}`,
            }}
        >
            {event.image_url && (
                <>
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${event.image_url})` }}
                    />
                    <div className="absolute inset-0 bg-black/70" />
                </>
            )}
            <div className="relative z-10 h-full flex flex-col">
                <div className="flex items-start gap-4 mb-4">
                    <div
                        className="flex flex-col items-center px-4 py-2 rounded-lg"
                        style={{ backgroundColor: event.color }}
                    >
                        <span className={`text-white font-bold ${dateClasses[size]}`}>
                            {date.day}
                        </span>
                        <span className="text-white text-sm font-medium">{date.month}</span>
                    </div>
                    {todayEvent && (
                        <span
                            className="px-3 py-1 rounded-full text-sm font-bold animate-pulse"
                            style={{ backgroundColor: event.color, color: 'white' }}
                        >
                            TODAY
                        </span>
                    )}
                </div>
                <h2 className={`font-bold text-white ${titleClasses[size]} mb-2 line-clamp-2`}>
                    {event.title}
                </h2>
                {event.description && size !== 'small' && (
                    <p className="text-zinc-300 text-sm flex-1 line-clamp-2">{event.description}</p>
                )}
                {time && <div className="text-zinc-400 text-sm mt-auto pt-2">🕐 {time}</div>}
            </div>
        </motion.div>
    );
}

export function CalendarSlide({ events }: CalendarSlideProps) {
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);

        return d;
    }, []);

    const upcomingEvents = useMemo(
        () =>
            events
                .filter((event) => {
                    const endDate = event.end_date
                        ? new Date(event.end_date + 'T23:59:59')
                        : new Date(event.start_date + 'T23:59:59');

                    return endDate >= today;
                })
                .slice(0, 8),
        [events, today],
    );

    const layout = useMemo(() => {
        const count = upcomingEvents.length;

        if (count === 0) {
            return 'empty';
        }

        if (count === 1) {
            return 'single';
        }

        if (count === 2) {
            return 'double';
        }

        if (count <= 4) {
            return 'grid-4';
        }

        return 'grid-8';
    }, [upcomingEvents.length]);

    if (layout === 'empty') {
        return (
            <div className="w-full h-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex flex-col items-center justify-center">
                <div className="text-8xl mb-6">📅</div>
                <h1 className="text-4xl font-bold text-white mb-2">No Upcoming Events</h1>
                <p className="text-zinc-400 text-xl">Check back later for updates</p>
            </div>
        );
    }

    if (layout === 'single') {
        const event = upcomingEvents[0]!;
        const date = formatDate(event.start_date);
        const time = formatTime(event.start_time);
        const endTime = formatTime(event.end_time);
        const eventDate = new Date(event.start_date + 'T00:00:00');
        const todayEvent = eventDate.toDateString() === today.toDateString();
        const isMultiDay = event.end_date && event.end_date !== event.start_date;
        const endDateFmt = event.end_date ? formatDate(event.end_date) : null;

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full h-full relative overflow-hidden"
            >
                {event.image_url ? (
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${event.image_url})` }}
                    >
                        <div className="absolute inset-0 bg-black/60" />
                    </div>
                ) : (
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `linear-gradient(135deg, ${event.color}40 0%, ${event.color}10 50%, #000 100%)`,
                        }}
                    />
                )}
                <div className="relative z-10 h-full flex flex-col items-center justify-center p-12 text-center">
                    <div className="mb-8">
                        <div
                            className="inline-flex flex-col items-center px-8 py-4 rounded-2xl"
                            style={{ backgroundColor: event.color }}
                        >
                            {todayEvent && (
                                <span className="text-white text-lg font-bold mb-1 animate-pulse">
                                    TODAY
                                </span>
                            )}
                            <span className="text-white text-2xl font-medium">{date.weekday}</span>
                            <span className="text-white text-6xl font-bold">{date.day}</span>
                            <span className="text-white text-2xl font-medium">{date.month}</span>
                        </div>
                    </div>
                    <h1 className="text-6xl md:text-8xl font-bold text-white mb-6 drop-shadow-lg max-w-5xl">
                        {event.title}
                    </h1>
                    {event.description && (
                        <p className="text-2xl md:text-3xl text-zinc-200 mb-6 max-w-4xl">
                            {event.description}
                        </p>
                    )}
                    {time && (
                        <div className="text-3xl text-white font-medium">
                            🕐 {time}
                            {endTime && ` - ${endTime}`}
                        </div>
                    )}
                    {isMultiDay && endDateFmt && (
                        <div className="mt-4 text-xl text-zinc-300">
                            Through {endDateFmt.month} {endDateFmt.day}
                        </div>
                    )}
                </div>
            </motion.div>
        );
    }

    return (
        <div className="w-full h-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 p-6">
            {layout === 'double' && (
                <div className="grid grid-cols-2 gap-6 h-[calc(100%-5rem)]">
                    {upcomingEvents.map((event) => (
                        <EventCard key={event.id} event={event} size="large" />
                    ))}
                </div>
            )}
            {layout === 'grid-4' && (
                <div className="grid grid-cols-2 grid-rows-2 gap-4 h-[calc(100%-5rem)]">
                    {upcomingEvents.map((event) => (
                        <EventCard key={event.id} event={event} size="medium" />
                    ))}
                </div>
            )}
            {layout === 'grid-8' && (
                <div className="grid grid-cols-4 grid-rows-2 gap-4 h-[calc(100%-5rem)]">
                    {upcomingEvents.map((event) => (
                        <EventCard key={event.id} event={event} size="small" />
                    ))}
                </div>
            )}
        </div>
    );
}
