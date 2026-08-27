'use client';

import { motion, type MotionStyle } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

import { guestLineupSlide } from '@/lib/slides/palette';
import type { GuestLineupData, GuestLineupGuest } from '@/lib/slides/types';
import { useSlidePollingData } from './use-slide-polling-data';

export type GuestLineupSlideProps = {
    data: GuestLineupData;
};

const POLL_MS = 30_000;
const BRAND_GREEN = '#1ae784';
const DEFAULT_ACCENT: string = guestLineupSlide.bitcoinOrangeFallback;

export function GuestLineupSlide({ data }: GuestLineupSlideProps) {
    const liveData = useSlidePollingData(data, data.endpoint ?? '/api/slide-data/guests', POLL_MS);
    const guests = liveData.guests.length ? liveData.guests : data.guests;
    const [activeIndex, setActiveIndex] = useState(0);
    const rotationMs = Math.max(3, liveData.rotationSeconds || 9) * 1000;

    useEffect(() => {
        if (guests.length < 2) {
            return;
        }

        const timer = setInterval(() => {
            setActiveIndex((index) => (index + 1) % guests.length);
        }, rotationMs);

        return () => clearInterval(timer);
    }, [guests.length, rotationMs]);

    const normalizedIndex = guests.length ? activeIndex % guests.length : 0;
    const activeGuest = guests[normalizedIndex] ?? guests[0];

    if (!activeGuest) {
        return <EmptyGuestLineup />;
    }

    const activeCategory = categoryLabel(activeGuest.category);
    const accent = categoryColor(activeGuest);
    const nextGuests = guests.filter((_, index) => index !== normalizedIndex).slice(0, 3);
    const heroDate = dateParts(activeGuest.appearanceAt);
    const monthLabel = heroDate.monthYear;

    return (
        <motion.div
            key={activeGuest.id}
            className="guest-lineup-root relative h-full w-full overflow-hidden bg-[#060606] text-white"
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={
                {
                    '--guest-accent': accent,
                    '--guest-rotation-ms': `${rotationMs}ms`,
                } as unknown as MotionStyle
            }
        >
            <GuestLineupStyles />
            <div
                className="pointer-events-none absolute inset-0 opacity-100"
                style={{
                    background: `radial-gradient(ellipse at 25% 80%, ${accent}18 0%, transparent 58%)`,
                }}
            />
            <div className="guest-lineup-shimmer" aria-hidden="true" />

            <section className="relative h-[66%] overflow-hidden">
                <div className="absolute left-0 top-0 z-10 h-full w-[35.5%] overflow-hidden bg-[#0e0e0e]">
                    <GuestMedia guest={activeGuest} size="hero" />
                    <div className="absolute inset-y-0 right-0 w-[47%] bg-gradient-to-r from-transparent to-[#060606]" />
                    <div className="absolute inset-x-0 bottom-0 h-[31%] bg-gradient-to-t from-[#060606] to-transparent" />
                </div>

                <div className="absolute inset-y-0 left-[29.2%] right-0 z-20 flex flex-col justify-between overflow-hidden px-[5.2%] py-[4.2%] pl-[9.4%]">
                    {liveData.mode !== 'live' ? (
                        <div className="guest-reveal-down w-fit border border-amber-300/45 bg-amber-300/14 px-4 py-2 text-sm font-black uppercase tracking-[0.3em] text-amber-100">
                            {liveData.mode === 'demo' ? 'Demo guests' : 'Guests unavailable'}
                        </div>
                    ) : (
                        <div className="guest-reveal-down flex items-start justify-between gap-8">
                            <span className="pt-1 text-[clamp(18px,1.35vw,26px)] font-black uppercase tracking-[0.22em] text-white/55">
                                Next Guest
                            </span>
                            <span className="text-right text-[clamp(20px,1.7vw,32px)] font-bold uppercase tracking-[0.16em] text-white/25">
                                {monthLabel}
                            </span>
                        </div>
                    )}

                    <div className="guest-reveal-up flex min-h-0 flex-1 flex-col justify-center py-3">
                        <div
                            className="mb-5 inline-flex w-fit items-center gap-2 px-4 py-2 text-[clamp(12px,0.8vw,15px)] font-black uppercase tracking-[0.2em]"
                            style={{ color: accent, backgroundColor: `${accent}18` }}
                        >
                            <span className="guest-category-dot h-[7px] w-[7px] rounded-full bg-current" />
                            {activeCategory}
                        </div>

                        <h1 className="guest-reveal-name max-w-[1120px] text-[clamp(56px,5.2vw,96px)] font-black uppercase leading-[0.9] tracking-normal text-white">
                            {activeGuest.name}
                        </h1>
                        <p className="guest-reveal-host mt-5 text-[clamp(22px,1.65vw,31px)] font-black uppercase italic tracking-[0.12em]">
                            <span className="mr-2 text-white/28">with</span>
                            <span style={{ color: BRAND_GREEN }}>
                                {activeGuest.host ?? 'Broadcast Planner'}
                            </span>
                        </p>
                        <p className="guest-reveal-role mt-6 text-[clamp(20px,1.5vw,29px)] font-semibold text-white/62">
                            {activeGuest.role || 'Guest'}
                        </p>
                        <p className="guest-reveal-company mt-2 text-[clamp(18px,1.35vw,26px)] font-medium text-white/32">
                            {activeGuest.company || activeGuest.program || 'Broadcast Planner'}
                        </p>
                    </div>

                    <div className="flex shrink-0 items-end justify-between gap-8">
                        <p className="guest-reveal-date text-[clamp(32px,3vw,56px)] font-black uppercase leading-none tracking-normal text-white/28">
                            {heroDate.weekday}
                        </p>
                        <p className="guest-reveal-date-main whitespace-nowrap text-[clamp(72px,7.1vw,136px)] font-black uppercase leading-[0.86] tracking-normal text-[#1ae784]">
                            {heroDate.month} <span>{heroDate.day}</span>
                        </p>
                    </div>
                </div>

                <div className="absolute inset-x-0 bottom-0 z-30 h-[3px] bg-white/[0.06]">
                    <div className="guest-progress h-full" style={{ backgroundColor: accent }} />
                </div>
            </section>

            <section className="relative h-[34%] border-t border-white/[0.07] bg-[#070707]">
                <header className="flex h-[21%] items-center justify-between border-b border-white/[0.05] bg-white/[0.015] px-[2.9%]">
                    <span className="text-[clamp(18px,1.25vw,24px)] font-black uppercase tracking-[0.16em] text-white/25">
                        Upcoming Guests
                    </span>
                    <span className="text-[clamp(16px,1.25vw,24px)] font-bold uppercase tracking-[0.1em] text-white/18">
                        {monthLabel}
                    </span>
                </header>

                <div className="grid h-[79%] grid-cols-3">
                    {nextGuests.map((guest, index) => (
                        <GuestStripCard key={guest.id} guest={guest} index={index} />
                    ))}
                    {!nextGuests.length ? (
                        <div className="col-span-3 flex items-center justify-center text-2xl font-black uppercase tracking-[0.2em] text-white/25">
                            No upcoming guests
                        </div>
                    ) : null}
                </div>
            </section>
        </motion.div>
    );
}

function GuestMedia({ guest, size }: { guest: GuestLineupGuest; size: 'hero' | 'strip' }) {
    const initials = useMemo(() => initialsFor(guest.name), [guest.name]);
    const [failedVideo, setFailedVideo] = useState(false);
    const [failedImage, setFailedImage] = useState(false);
    const accent = categoryColor(guest);
    const mediaClass =
        size === 'hero'
            ? 'guest-ken-burns h-full w-full object-cover object-top'
            : 'h-full w-full object-cover object-top';

    if (guest.videoUrl && !failedVideo) {
        return (
            <video
                src={guest.videoUrl}
                className={mediaClass}
                muted
                autoPlay
                loop
                playsInline
                onError={() => setFailedVideo(true)}
            />
        );
    }

    if (guest.photoUrl && !failedImage) {
        return (
            <img
                src={guest.photoUrl}
                alt=""
                className={mediaClass}
                onError={() => setFailedImage(true)}
            />
        );
    }

    return (
        <div className="guest-ken-burns flex h-full w-full items-center justify-center bg-gradient-to-br from-[#111] to-[#060606]">
            <div
                className={
                    size === 'hero'
                        ? 'flex h-[46%] aspect-square items-center justify-center rounded-full border-2 text-[clamp(84px,6.8vw,130px)] font-black tracking-[-0.04em]'
                        : 'flex h-24 w-24 items-center justify-center rounded-full border text-[40px] font-black tracking-[-0.05em]'
                }
                style={{
                    background: `linear-gradient(135deg, ${accent}28 0%, ${accent}06 100%)`,
                    borderColor: `${accent}38`,
                    color: accent,
                    opacity: size === 'hero' ? 0.72 : 0.86,
                }}
            >
                {initials}
            </div>
        </div>
    );
}

function GuestStripCard({ guest, index }: { guest: GuestLineupGuest; index: number }) {
    const accent = categoryColor(guest);
    const parts = dateParts(guest.appearanceAt);
    const pill = countdownPill(guest.appearanceAt);

    return (
        <article
            className="guest-strip-card relative grid min-w-0 grid-cols-[200px_minmax(0,1fr)] overflow-hidden border-r border-white/[0.05]"
            style={{ animationDelay: `${0.15 + index * 0.1}s` }}
        >
            <div
                className="absolute left-0 top-0 z-20 h-full w-[3px]"
                style={{ backgroundColor: accent }}
            />
            <div className="relative overflow-hidden bg-[#0e0e0e]">
                <GuestMedia guest={guest} size="strip" />
            </div>
            <div className="flex min-w-0 flex-col justify-between px-8 py-7">
                <div className="min-w-0">
                    <p
                        className="text-[clamp(14px,0.95vw,18px)] font-black uppercase tracking-[0.16em]"
                        style={{ color: accent }}
                    >
                        {categoryLabel(guest.category)}
                    </p>
                    <p className="mt-3 line-clamp-2 text-[clamp(26px,1.98vw,38px)] font-black uppercase leading-[1.05] tracking-normal text-white">
                        {guest.name}
                    </p>
                    <p className="mt-2 line-clamp-2 text-[clamp(15px,0.95vw,18px)] font-medium leading-snug text-white/38">
                        {joinDetails(guest.role, guest.company)}
                    </p>
                    <p className="mt-2 text-[clamp(13px,0.88vw,17px)] font-black uppercase tracking-[0.15em] text-white/32">
                        with {guest.host ?? 'Broadcast Planner'}
                    </p>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="text-[clamp(14px,0.98vw,19px)] font-bold uppercase tracking-[0.08em] text-white/42">
                        {parts.exact}
                    </span>
                    <span
                        className="whitespace-nowrap px-4 py-2 text-[clamp(13px,0.94vw,18px)] font-bold uppercase tracking-[0.08em]"
                        style={{ color: pill.color, backgroundColor: pill.bg }}
                    >
                        {pill.text}
                    </span>
                </div>
            </div>
        </article>
    );
}

function EmptyGuestLineup() {
    return (
        <div className="flex h-full w-full items-center justify-center bg-[#060606] text-white">
            <p className="text-3xl font-black uppercase tracking-[0.24em] text-white/40">
                No guests ready
            </p>
        </div>
    );
}

function GuestLineupStyles() {
    return (
        <style>{`
      @keyframes guestKenBurns {
        from { transform: scale(1); transform-origin: center top; }
        to { transform: scale(1.16); transform-origin: center top; }
      }
      @keyframes guestRevealUp {
        from { opacity: 0; transform: translateY(34px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes guestRevealDown {
        from { opacity: 0; transform: translateY(-18px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes guestRevealLeft {
        from { opacity: 0; transform: translateX(24px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes guestSheen {
        from { transform: translateX(-180%) skewX(-12deg); }
        to { transform: translateX(260%) skewX(-12deg); }
      }
      @keyframes guestProgress {
        from { width: 0%; }
        to { width: 100%; }
      }
      @keyframes guestDotBlink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.25; }
      }
      @keyframes guestAccentGlow {
        0%, 100% { opacity: 0.55; }
        50% { opacity: 1; }
      }
      .guest-ken-burns {
        animation: guestKenBurns var(--guest-rotation-ms, 9000ms) ease-out forwards;
      }
      .guest-lineup-shimmer {
        position: absolute;
        inset: 0;
        z-index: 50;
        pointer-events: none;
        overflow: hidden;
      }
      .guest-lineup-shimmer::before,
      .guest-lineup-shimmer::after {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: linear-gradient(to right, transparent 0%, rgba(255,255,255,0.018) 38%, rgba(255,255,255,0.045) 50%, rgba(255,255,255,0.018) 62%, transparent 100%);
        animation: guestSheen 7s cubic-bezier(0.45,0,0.55,1) infinite;
      }
      .guest-lineup-shimmer::before { width: 35%; animation-delay: 1.5s; }
      .guest-lineup-shimmer::after { width: 20%; animation-delay: 4.5s; }
      .guest-reveal-down { animation: guestRevealDown 0.6s cubic-bezier(0.16,1,0.3,1) both; }
      .guest-reveal-up { animation: guestRevealUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.18s both; }
      .guest-reveal-name { animation: guestRevealUp 0.95s cubic-bezier(0.16,1,0.3,1) 0.34s both; }
      .guest-reveal-host { animation: guestRevealUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.46s both; }
      .guest-reveal-role { animation: guestRevealUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.58s both; }
      .guest-reveal-company { animation: guestRevealUp 0.7s cubic-bezier(0.16,1,0.3,1) 0.65s both; }
      .guest-reveal-date { animation: guestRevealUp 0.8s cubic-bezier(0.16,1,0.3,1) 0.78s both; }
      .guest-reveal-date-main { animation: guestRevealLeft 0.9s cubic-bezier(0.16,1,0.3,1) 0.86s both; }
      .guest-progress {
        position: relative;
        animation: guestProgress var(--guest-rotation-ms, 9000ms) linear forwards;
      }
      .guest-progress::after {
        content: "";
        position: absolute;
        right: -1px;
        top: 50%;
        width: 48px;
        height: 8px;
        transform: translateY(-50%);
        background: inherit;
        filter: blur(5px);
        opacity: 0.9;
      }
      .guest-category-dot { animation: guestDotBlink 2s ease-in-out infinite; }
      .guest-strip-card {
        animation: guestRevealUp 0.6s cubic-bezier(0.16,1,0.3,1) both;
      }
      .guest-strip-card > div:first-of-type {
        animation: guestAccentGlow 3.5s ease-in-out infinite;
      }
    `}</style>
    );
}

function joinDetails(role?: string | null, company?: string | null) {
    return [role, company].filter(Boolean).join(' · ') || 'Guest';
}

function initialsFor(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');
}

function categoryLabel(value: string | null | undefined) {
    return (value || 'guest').toUpperCase();
}

function categoryColor(guest: GuestLineupGuest) {
    switch (categoryLabel(guest.category)) {
        case 'BITCOIN':
            return guestLineupSlide.bitcoinOrangeFallback;
        case 'MACRO':
            return '#3b82f6';
        case 'POLICY':
            return '#a78bfa';
        case 'MARKETS':
            return BRAND_GREEN;
        default:
            return safeColor(guest.color, '#ffffff');
    }
}

function dateParts(value: string | null) {
    const date = parseDate(value);

    if (!date) {
        return {
            weekday: 'TBD',
            month: 'TBD',
            day: '',
            monthYear: 'Schedule pending',
            exact: 'TBD',
        };
    }

    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' })
        .format(date)
        .toUpperCase();
    const shortWeekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
        .format(date)
        .toUpperCase();
    const month = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(date).toUpperCase();
    const shortMonth = new Intl.DateTimeFormat('en-US', { month: 'short' })
        .format(date)
        .toUpperCase();
    const year = new Intl.DateTimeFormat('en-US', { year: 'numeric' }).format(date);

    return {
        weekday,
        month,
        day: String(date.getDate()),
        monthYear: `${month} ${year}`,
        exact: `${shortWeekday} · ${shortMonth} ${date.getDate()}`,
    };
}

function countdownPill(value: string | null) {
    const date = parseDate(value);

    if (!date) {
        return { text: 'TBD', color: BRAND_GREEN, bg: 'rgba(26,231,132,0.08)' };
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const then = new Date(date);
    then.setHours(0, 0, 0, 0);
    const days = Math.round((then.getTime() - now.getTime()) / 86_400_000);

    if (days < 0) {
        return { text: 'ON AIR', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
    }

    if (days === 0) {
        return { text: 'TODAY', color: BRAND_GREEN, bg: 'rgba(26,231,132,0.08)' };
    }

    if (days === 1) {
        return { text: 'TOMORROW', color: BRAND_GREEN, bg: 'rgba(26,231,132,0.08)' };
    }

    return { text: `IN ${days} DAYS`, color: BRAND_GREEN, bg: 'rgba(26,231,132,0.08)' };
}

function parseDate(value: string | null) {
    if (!value) {
        return null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

function safeColor(value: string | null | undefined, fallback = DEFAULT_ACCENT) {
    return /^#[0-9a-f]{6}$/i.test(value ?? '') ? value! : fallback;
}
