'use client';

import { useEffect, useMemo, useState } from 'react';

type LiveStatus = {
    currentAirDate: string;
    currentTime: string;
    timezone: string;
    active: null | {
        blockId: string;
        title: string;
        startTime: string;
        live: boolean;
        lowerThird: {
            visible: boolean;
            text: string;
            assetUrl: string;
        };
    };
    preview: null | {
        willOverride: boolean;
        affected: Array<{
            id: string;
            title: string;
            startTime: string;
            endTime: string;
            live: boolean;
        }>;
    };
};

const emptyStatus: LiveStatus = {
    currentAirDate: '',
    currentTime: '',
    timezone: '',
    active: null,
    preview: null,
};

export function LiveConsole() {
    const [status, setStatus] = useState<LiveStatus>(emptyStatus);
    const [timingMode, setTimingMode] = useState<'now' | 'future'>('now');
    const [date, setDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [title, setTitle] = useState('');
    const [liveSourceType, setLiveSourceType] = useState<'youtube' | 'hls'>('youtube');
    const [liveUrl, setLiveUrl] = useState('');
    const [lowerThirdText, setLowerThirdText] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    const statusUrl = useMemo(() => {
        const params = new URLSearchParams();

        if (timingMode === 'future' && date) {
            params.set('date', date);
        }

        if (timingMode === 'future' && startTime) {
            params.set('startTime', startTime);
        }

        return `/api/live/status${params.size ? `?${params.toString()}` : ''}`;
    }, [date, startTime, timingMode]);

    useEffect(() => {
        if (
            window.location.protocol === 'http:' &&
            !['localhost', '127.0.0.1'].includes(window.location.hostname)
        ) {
            window.location.replace(`https://${window.location.host}${window.location.pathname}`);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                if (
                    window.location.protocol === 'http:' &&
                    !['localhost', '127.0.0.1'].includes(window.location.hostname)
                ) {
                    return;
                }
                const response = await fetch(statusUrl, { cache: 'no-store' });
                const payload = (await response.json()) as LiveStatus & { error?: string };

                if (cancelled) {
                    return;
                }

                if (!response.ok) {
                    setError(payload.error || 'Could not load live status');

                    return;
                }
                setStatus(payload);
                setLowerThirdText((current) => current || payload.active?.lowerThird.text || '');
                setDate((current) => current || payload.currentAirDate);
                setStartTime((current) => current || payload.currentTime.slice(0, 5));
            } catch (nextError) {
                if (!cancelled) {
                    setError(
                        nextError instanceof Error
                            ? nextError.message
                            : 'Could not load live status',
                    );
                }
            }
        }

        void load();
        const interval = window.setInterval(() => void load(), 5000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [statusUrl]);

    async function sendLive(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        setMessage('');
        setError('');

        try {
            const response = await fetch('/api/live/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date,
                    startTime,
                    title,
                    liveSourceType,
                    liveUrl,
                    timingMode,
                }),
            });
            const payload = (await response.json()) as { ok?: boolean; error?: string };

            if (!response.ok) {
                throw new Error(payload.error || 'Could not send live');
            }
            setMessage('Live sent');
            setLiveUrl('');
            await refreshStatus();
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Could not send live');
        } finally {
            setPending(false);
        }
    }

    async function cancelLive() {
        setPending(true);
        setMessage('');
        setError('');

        try {
            const response = await fetch('/api/live/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const payload = (await response.json()) as { ok?: boolean; error?: string };

            if (!response.ok) {
                throw new Error(payload.error || 'Could not cancel live');
            }
            setMessage('Live cancelled');
            await refreshStatus();
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'Could not cancel live');
        } finally {
            setPending(false);
        }
    }

    async function setLowerThirdVisible(visible: boolean) {
        setPending(true);
        setMessage('');
        setError('');

        try {
            const response = await fetch('/api/live/lower-third', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visible, text: lowerThirdText }),
            });
            const payload = (await response.json()) as { ok?: boolean; error?: string };

            if (!response.ok) {
                throw new Error(payload.error || 'Could not update lower third');
            }
            setMessage(visible ? 'Lower third shown' : 'Lower third hidden');
            await refreshStatus();
        } catch (nextError) {
            setError(
                nextError instanceof Error ? nextError.message : 'Could not update lower third',
            );
        } finally {
            setPending(false);
        }
    }

    async function refreshStatus() {
        const response = await fetch(statusUrl, { cache: 'no-store' });
        const payload = (await response.json()) as LiveStatus;

        if (response.ok) {
            setStatus(payload);
        }
    }

    const affected = status.preview?.affected ?? [];
    const scheduledLabel =
        timingMode === 'now'
            ? `now (${status.currentTime || '--:--:--'})`
            : `${date || '---- -- --'} ${startTime || '--:--'}`;
    const activeLive = status.active?.live ? status.active : null;
    const lowerThirdVisible = activeLive?.lowerThird.visible === true;

    return (
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-5 py-8">
            <header>
                <p className="eyebrow text-signal">Live override</p>
                <h1 className="mt-2 text-3xl font-semibold">Send live</h1>
                <p className="mt-2 text-sm text-muted">
                    Current playout time {status.currentTime || '--:--:--'} ·{' '}
                    {status.timezone || 'playout'}
                </p>
            </header>

            <section className="surface-panel p-4">
                <p className="text-sm font-semibold">On air now</p>
                <p className="mt-1 text-lg">
                    {status.active
                        ? `${status.active.live ? 'LIVE: ' : ''}${status.active.title}`
                        : 'Fallback / no active block'}
                </p>
                <button
                    className="btn-danger mt-4"
                    disabled={pending || !activeLive}
                    type="button"
                    onClick={() => void cancelLive()}
                >
                    Cancel live
                </button>
            </section>

            <section className="surface-panel grid gap-3 p-4">
                <div>
                    <p className="text-sm font-semibold">Lower third</p>
                    <p className="mt-1 text-sm text-muted">
                        {activeLive
                            ? lowerThirdVisible
                                ? 'Visible on live output'
                                : 'Hidden on live output'
                            : 'No active live on air'}
                    </p>
                </div>
                <label className="grid gap-1 text-sm font-semibold">
                    Lower third text
                    <input
                        className="border border-line px-3 py-2"
                        disabled={!activeLive || pending}
                        placeholder="Text to show over the lower third"
                        value={lowerThirdText}
                        onChange={(event) => setLowerThirdText(event.target.value)}
                    />
                </label>
                <button
                    className={lowerThirdVisible ? 'btn-danger' : 'btn-primary'}
                    disabled={!activeLive || pending}
                    type="button"
                    onClick={() => void setLowerThirdVisible(!lowerThirdVisible)}
                >
                    {lowerThirdVisible ? 'Hide lower third' : 'Show lower third'}
                </button>
            </section>

            <form
                className="surface-panel grid gap-4 overflow-hidden p-4"
                onSubmit={(event) => void sendLive(event)}
            >
                <div className="grid grid-cols-2 rounded-md border border-line bg-panel p-1">
                    <button
                        className={[
                            'min-h-10 rounded px-3 text-sm font-semibold',
                            timingMode === 'now'
                                ? 'bg-accent-positive text-surface-elevated-1'
                                : 'text-muted hover:bg-white/5 hover:text-white',
                        ].join(' ')}
                        type="button"
                        onClick={() => setTimingMode('now')}
                    >
                        Send now
                    </button>
                    <button
                        className={[
                            'min-h-10 rounded px-3 text-sm font-semibold',
                            timingMode === 'future'
                                ? 'bg-accent-positive text-surface-elevated-1'
                                : 'text-muted hover:bg-white/5 hover:text-white',
                        ].join(' ')}
                        type="button"
                        onClick={() => setTimingMode('future')}
                    >
                        Schedule future
                    </button>
                </div>

                <div className="grid gap-4 rounded-md border border-line bg-panel/60 p-4">
                    <label className="grid gap-1 text-sm font-semibold">
                        Live URL
                        <input
                            className="border border-line px-3 py-2"
                            required
                            placeholder={
                                liveSourceType === 'youtube'
                                    ? 'https://www.youtube.com/watch?v=...'
                                    : 'https://.../live.m3u8'
                            }
                            value={liveUrl}
                            onChange={(event) => setLiveUrl(event.target.value)}
                        />
                    </label>

                    <label className="grid gap-1 text-sm font-semibold">
                        Title
                        <input
                            className="border border-line px-3 py-2"
                            placeholder="Live"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                        />
                    </label>
                </div>

                <div
                    className={[
                        'rounded-md border border-line bg-panel/60 p-4',
                        timingMode === 'future' ? 'grid gap-3 sm:grid-cols-3' : 'grid',
                    ].join(' ')}
                >
                    <label className="grid gap-1 text-sm font-semibold">
                        Type
                        <select
                            className="border border-line px-3 py-2"
                            value={liveSourceType}
                            onChange={(event) =>
                                setLiveSourceType(event.target.value === 'hls' ? 'hls' : 'youtube')
                            }
                        >
                            <option value="youtube">YouTube</option>
                            <option value="hls">HLS</option>
                        </select>
                    </label>
                    {timingMode === 'future' ? (
                        <>
                            <label className="grid gap-1 text-sm font-semibold">
                                Day
                                <input
                                    className="border border-line px-3 py-2"
                                    required
                                    type="date"
                                    value={date}
                                    onChange={(event) => setDate(event.target.value)}
                                />
                            </label>
                            <label className="grid gap-1 text-sm font-semibold">
                                Time
                                <input
                                    className="border border-line px-3 py-2"
                                    required
                                    type="time"
                                    value={startTime}
                                    onChange={(event) => setStartTime(event.target.value)}
                                />
                            </label>
                        </>
                    ) : null}
                </div>

                {affected.length ? (
                    <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                        <p className="font-semibold">
                            This live overrides programming from {scheduledLabel} until cancelled.
                        </p>
                        <ul className="mt-2 grid gap-1 text-amber-100/80">
                            {affected.slice(0, 4).map((block) => (
                                <li key={block.id}>
                                    {block.startTime}-{block.endTime} · {block.title}
                                </li>
                            ))}
                        </ul>
                    </div>
                ) : (
                    <div className="rounded-md border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100">
                        No known scheduled blocks will be overridden.
                    </div>
                )}

                {error ? <p className="text-sm font-semibold text-red-300">{error}</p> : null}
                {message ? (
                    <p className="text-sm font-semibold text-emerald-300">{message}</p>
                ) : null}

                <button className="btn-primary" disabled={pending} type="submit">
                    {timingMode === 'now' ? 'Send live' : 'Schedule live'}
                </button>
            </form>
        </main>
    );
}
