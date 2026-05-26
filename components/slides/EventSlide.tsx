'use client';

import { useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import type {
    CalendarEvent,
    ScheduleTime,
    LayoutOrientation,
    EventSlideStyle,
} from '@/lib/slides/types';
import { EventSlideModern } from './EventSlideModern';

export type EventSlideProps = {
    selectedEventIds: string[];
    events: CalendarEvent[];
    layoutOrientation?: LayoutOrientation | null;
    eventSlideStyle?: EventSlideStyle | null;
    eventSlideTitle?: string | null;
};

type LayoutSize = 'full' | 'half' | 'third' | 'quarter';

const TITLE_SIZES: Record<LayoutSize, Record<string, string>> = {
    full: {
        small: 'text-5xl md:text-6xl',
        medium: 'text-6xl md:text-7xl',
        large: 'text-7xl md:text-8xl',
        xlarge: 'text-8xl md:text-9xl',
    },
    half: {
        small: 'text-3xl md:text-4xl',
        medium: 'text-4xl md:text-5xl',
        large: 'text-5xl md:text-6xl',
        xlarge: 'text-6xl md:text-7xl',
    },
    third: {
        small: 'text-2xl md:text-3xl',
        medium: 'text-3xl md:text-4xl',
        large: 'text-4xl md:text-5xl',
        xlarge: 'text-5xl md:text-6xl',
    },
    quarter: {
        small: 'text-xl md:text-2xl',
        medium: 'text-2xl md:text-3xl',
        large: 'text-3xl md:text-4xl',
        xlarge: 'text-4xl md:text-5xl',
    },
};

const DESC_SIZES: Record<LayoutSize, string> = {
    full: 'text-2xl md:text-3xl',
    half: 'text-lg md:text-xl',
    third: 'text-base md:text-lg',
    quarter: 'text-sm md:text-base',
};

function getTitleSizeClass(titleSize: string | null | undefined, layoutSize: LayoutSize): string {
    const size = titleSize ?? 'large';

    return TITLE_SIZES[layoutSize][size] ?? TITLE_SIZES[layoutSize]['large'] ?? 'text-4xl';
}

function parseScheduleTimes(times: ScheduleTime[] | string | null | undefined): ScheduleTime[] {
    if (!times) {
        return [];
    }

    if (Array.isArray(times)) {
        return times;
    }

    try {
        return JSON.parse(times) as ScheduleTime[];
    } catch {
        return [];
    }
}

function isToday(dateStr: string): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T00:00:00');

    return d.toDateString() === today.toDateString();
}

function formatDate(dateStr: string) {
    const date = new Date(dateStr + 'T00:00:00');

    return {
        day: date.getDate(),
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
    };
}

function SingleEventCard({ event }: { event: CalendarEvent }) {
    const date = formatDate(event.start_date);
    const todayEvent = isToday(event.start_date);
    const scheduleTimes = parseScheduleTimes(event.schedule_times);
    const titleFont = event.title_font ?? 'inherit';
    const titleColor = event.title_color ?? '#FFFFFF';
    const textColor = event.text_color ?? '#E5E7EB';
    const showDateBadge = event.show_date_badge ?? true;
    const titleSizeClass = getTitleSizeClass(event.title_size, 'full');

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
                    <div
                        className="absolute inset-0"
                        style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
                    />
                </div>
            ) : (
                <div
                    className="absolute inset-0"
                    style={{
                        background: `linear-gradient(135deg, ${event.color}40 0%, ${event.color}10 50%, #000 100%)`,
                    }}
                />
            )}

            <div className="relative z-10 h-full flex flex-col items-center justify-center p-8 md:p-12 text-center">
                {showDateBadge && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="mb-6 md:mb-8"
                    >
                        <div
                            className="inline-flex flex-col items-center px-8 md:px-12 py-4 md:py-6 rounded-2xl shadow-2xl"
                            style={{ backgroundColor: event.color }}
                        >
                            {todayEvent && (
                                <span className="text-white text-lg md:text-xl font-bold mb-2 animate-pulse">
                                    TODAY
                                </span>
                            )}
                            <span className="text-white text-2xl md:text-3xl font-medium">
                                {date.weekday}
                            </span>
                            <span className="text-white text-6xl md:text-8xl font-bold leading-none">
                                {date.day}
                            </span>
                            <span className="text-white text-2xl md:text-3xl font-medium">
                                {date.month}
                            </span>
                        </div>
                    </motion.div>
                )}

                <motion.h1
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className={`font-bold mb-4 md:mb-6 drop-shadow-2xl max-w-6xl text-center ${titleSizeClass}`}
                    style={{
                        fontFamily: titleFont,
                        color: titleColor,
                        textShadow: '2px 2px 20px rgba(0,0,0,0.8)',
                    }}
                >
                    {event.title}
                </motion.h1>

                {event.description && (
                    <motion.p
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-xl md:text-2xl lg:text-3xl mb-6 max-w-4xl text-center leading-relaxed"
                        style={{ color: textColor, textShadow: '1px 1px 10px rgba(0,0,0,0.6)' }}
                    >
                        {event.description}
                    </motion.p>
                )}

                {scheduleTimes.length > 0 && (
                    <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="flex flex-wrap justify-center gap-3 md:gap-4"
                    >
                        {scheduleTimes.map((schedule, index) => (
                            <div
                                key={index}
                                className="text-xl md:text-2xl font-semibold px-4 md:px-6 py-2 md:py-3 rounded-xl"
                                style={{
                                    color: textColor,
                                    backgroundColor: 'rgba(0,0,0,0.5)',
                                    border: `1px solid ${event.color}`,
                                }}
                            >
                                🕐 {schedule.time}{' '}
                                <span className="opacity-80">{schedule.timezone}</span>
                            </div>
                        ))}
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
}

type MultiSize = 'half' | 'third' | 'quarter';

function EventCard({ event, size }: { event: CalendarEvent; size: MultiSize }) {
    const date = formatDate(event.start_date);
    const todayEvent = isToday(event.start_date);
    const scheduleTimes = parseScheduleTimes(event.schedule_times);
    const titleFont = event.title_font ?? 'inherit';
    const titleColor = event.title_color ?? '#FFFFFF';
    const textColor = event.text_color ?? '#E5E7EB';
    const showDateBadge = event.show_date_badge ?? true;
    const titleSizeClass = getTitleSizeClass(event.title_size, size);
    const descSizeClass = DESC_SIZES[size];

    const sizeConfig = {
        half: {
            date: 'text-4xl md:text-5xl',
            padding: 'p-6 md:p-8',
            descLines: 3,
            timeSize: 'text-lg md:text-xl',
        },
        third: {
            date: 'text-3xl md:text-4xl',
            padding: 'p-4 md:p-6',
            descLines: 2,
            timeSize: 'text-base md:text-lg',
        },
        quarter: {
            date: 'text-2xl md:text-3xl',
            padding: 'p-3 md:p-5',
            descLines: 2,
            timeSize: 'text-sm md:text-base',
        },
    };
    const config = sizeConfig[size];

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`relative h-full overflow-hidden ${config.padding}`}
        >
            {event.image_url ? (
                <>
                    <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${event.image_url})` }}
                    />
                    <div
                        className="absolute inset-0"
                        style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
                    />
                </>
            ) : (
                <div
                    className="absolute inset-0"
                    style={{
                        background: `linear-gradient(135deg, ${event.color}30 0%, ${event.color}10 100%)`,
                    }}
                />
            )}

            <div
                className="absolute left-0 top-0 bottom-0 w-1.5 md:w-2"
                style={{ backgroundColor: event.color }}
            />

            <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-2">
                {showDateBadge && (
                    <div className="mb-3 md:mb-4">
                        <div
                            className="inline-flex flex-col items-center px-3 md:px-4 py-2 rounded-xl shadow-lg"
                            style={{ backgroundColor: event.color }}
                        >
                            {todayEvent && (
                                <span className="text-white text-xs font-bold animate-pulse">
                                    TODAY
                                </span>
                            )}
                            <span className={`text-white font-bold ${config.date}`}>
                                {date.day}
                            </span>
                            <span className="text-white text-xs md:text-sm font-medium uppercase">
                                {date.month}
                            </span>
                        </div>
                    </div>
                )}

                <h2
                    className={`font-bold mb-2 md:mb-3 drop-shadow-lg text-center ${titleSizeClass}`}
                    style={{
                        fontFamily: titleFont,
                        color: titleColor,
                        textShadow: '1px 1px 10px rgba(0,0,0,0.6)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}
                >
                    {event.title}
                </h2>

                {event.description && (
                    <p
                        className={`${descSizeClass} mb-2 md:mb-3 text-center leading-snug`}
                        style={{
                            color: textColor,
                            textShadow: '1px 1px 5px rgba(0,0,0,0.5)',
                            display: '-webkit-box',
                            WebkitLineClamp: config.descLines,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                        }}
                    >
                        {event.description}
                    </p>
                )}

                {scheduleTimes.length > 0 && (
                    <div className="mt-auto pt-2 flex flex-wrap justify-center gap-1 md:gap-2">
                        {scheduleTimes
                            .slice(0, size === 'quarter' ? 2 : 3)
                            .map((schedule, index) => (
                                <div
                                    key={index}
                                    className={`${config.timeSize} font-medium px-2 md:px-3 py-1 rounded-lg`}
                                    style={{ color: textColor, backgroundColor: 'rgba(0,0,0,0.5)' }}
                                >
                                    {schedule.time}{' '}
                                    <span className="opacity-70">{schedule.timezone}</span>
                                </div>
                            ))}
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function EventSlideInner({
    selectedEventIds,
    events,
    layoutOrientation,
    eventSlideStyle,
    eventSlideTitle,
}: EventSlideProps) {
    const selectedEvents = useMemo(() => {
        if (selectedEventIds.length === 0) {
            return [];
        }
        const eventsMap = new Map(events.map((e) => [e.id, e]));

        return selectedEventIds
            .map((id) => eventsMap.get(id))
            .filter((e): e is CalendarEvent => e !== undefined);
    }, [selectedEventIds, events]);

    if (eventSlideStyle === 'modern') {
        return (
            <EventSlideModern
                selectedEventIds={selectedEventIds}
                events={events}
                {...(eventSlideTitle !== undefined ? { eventSlideTitle } : {})}
            />
        );
    }

    const eventCount = selectedEvents.length;
    const orientation = layoutOrientation ?? 'horizontal';

    if (eventCount === 0) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full h-full bg-gradient-to-br from-zinc-900 to-black flex items-center justify-center"
            >
                <div className="text-center">
                    <div className="text-6xl mb-4">📅</div>
                    <p className="text-white text-2xl">No events selected</p>
                    <p className="text-zinc-400">Configure this slide in the admin panel</p>
                </div>
            </motion.div>
        );
    }

    if (eventCount === 1) {
        return <SingleEventCard event={selectedEvents[0]!} />;
    }

    if (eventCount === 2) {
        return (
            <div className="w-full h-full bg-black flex items-center justify-center px-[16.67%] py-[8%]">
                <div className="w-full h-full grid grid-cols-2 gap-0.5">
                    {selectedEvents.map((event) => (
                        <EventCard key={event.id} event={event} size="third" />
                    ))}
                </div>
            </div>
        );
    }

    if (eventCount === 3) {
        return (
            <div
                className={`w-full h-full bg-black gap-0.5 ${
                    orientation === 'horizontal' ? 'grid grid-cols-3' : 'grid grid-rows-3'
                }`}
            >
                {selectedEvents.map((event) => (
                    <EventCard key={event.id} event={event} size="third" />
                ))}
            </div>
        );
    }

    return (
        <div className="w-full h-full grid grid-cols-2 grid-rows-2 bg-black gap-0.5">
            {selectedEvents.map((event) => (
                <EventCard key={event.id} event={event} size="quarter" />
            ))}
        </div>
    );
}

export const EventSlide = memo(EventSlideInner, (prev, next) => {
    if (prev.eventSlideStyle !== next.eventSlideStyle) {
        return false;
    }

    if (prev.layoutOrientation !== next.layoutOrientation) {
        return false;
    }

    if (prev.eventSlideTitle !== next.eventSlideTitle) {
        return false;
    }

    if (prev.selectedEventIds.join(',') !== next.selectedEventIds.join(',')) {
        return false;
    }

    for (const id of prev.selectedEventIds) {
        const p = prev.events.find((e) => e.id === id);
        const n = next.events.find((e) => e.id === id);

        if (!p || !n || p.updated_at !== n.updated_at) {
            return false;
        }
    }

    return true;
});
