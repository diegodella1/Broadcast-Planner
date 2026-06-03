'use client';

import { AlertTriangle, Clock, Eye, EyeOff, Radio, Send, Square, Type } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
    const activeBlockRef = useRef<string | null>(null);
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

                if (activeBlockRef.current !== payload.active?.blockId) {
                    activeBlockRef.current = payload.active?.blockId ?? null;
                    setLowerThirdText(payload.active?.lowerThird.text || '');
                }

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

    async function updateLowerThird(visible: boolean) {
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
            setMessage(visible ? 'Lower third updated' : 'Lower third hidden');
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
    const isBusy = pending;
    const submitLabel = timingMode === 'now' ? 'Send live now' : 'Schedule live';

    return (
        <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 px-5 py-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="eyebrow text-signal">Live control</p>
                    <h1 className="mt-2 text-3xl font-semibold">Live output</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                    <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-white/10 bg-surface-elevated-2 px-3">
                        <Clock size={16} />
                        {status.currentTime || '--:--:--'}
                    </span>
                    <span className="inline-flex min-h-9 items-center rounded-md border border-white/10 bg-surface-elevated-2 px-3">
                        {status.timezone || 'playout'}
                    </span>
                </div>
            </header>

            {error || message ? (
                <div
                    className={[
                        'rounded-md border px-4 py-3 text-sm font-semibold',
                        error
                            ? 'border-red-400/30 bg-red-400/10 text-red-200'
                            : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
                    ].join(' ')}
                >
                    {error || message}
                </div>
            ) : null}

            <section className="surface-panel grid gap-4 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold">On air</p>
                        <p className="mt-1 truncate text-2xl font-semibold">
                            {status.active?.title || 'Fallback'}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={[
                                'inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-bold',
                                activeLive
                                    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                                    : 'border-white/10 bg-white/5 text-muted',
                            ].join(' ')}
                        >
                            <Radio size={16} />
                            {activeLive ? 'Live' : 'Program'}
                        </span>
                        <button
                            className="btn-danger"
                            disabled={isBusy || !activeLive}
                            type="button"
                            onClick={() => void cancelLive()}
                        >
                            <Square size={16} />
                            End live
                        </button>
                    </div>
                </div>
            </section>

            <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
                <form
                    className="surface-panel grid gap-4 p-4"
                    onSubmit={(event) => void sendLive(event)}
                >
                    <div className="flex items-center gap-2">
                        <Send size={18} className="text-accent-positive" />
                        <h2 className="text-lg font-semibold">Send live</h2>
                    </div>

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
                            Now
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
                            Later
                        </button>
                    </div>

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

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1 text-sm font-semibold">
                            Title
                            <input
                                className="border border-line px-3 py-2"
                                placeholder="Live"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                            />
                        </label>

                        <label className="grid gap-1 text-sm font-semibold">
                            Source
                            <select
                                className="border border-line px-3 py-2"
                                value={liveSourceType}
                                onChange={(event) =>
                                    setLiveSourceType(
                                        event.target.value === 'hls' ? 'hls' : 'youtube',
                                    )
                                }
                            >
                                <option value="youtube">YouTube</option>
                                <option value="hls">HLS</option>
                            </select>
                        </label>
                    </div>

                    {timingMode === 'future' ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-1 text-sm font-semibold">
                                Date
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
                        </div>
                    ) : null}

                    {affected.length ? (
                        <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                            <p className="flex items-center gap-2 font-semibold">
                                <AlertTriangle size={16} />
                                Overrides programming from {scheduledLabel}
                            </p>
                            <p className="mt-1 text-amber-100/75">
                                {affected.length} block{affected.length === 1 ? '' : 's'} affected
                            </p>
                        </div>
                    ) : null}

                    <button className="btn-primary min-h-12" disabled={isBusy} type="submit">
                        <Send size={16} />
                        {submitLabel}
                    </button>
                </form>

                <section className="surface-panel grid content-start gap-4 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Type size={18} className="text-accent-positive" />
                            <h2 className="text-lg font-semibold">Lower third</h2>
                        </div>
                        <span
                            className={[
                                'rounded-md border px-2.5 py-1 text-xs font-bold',
                                lowerThirdVisible
                                    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
                                    : 'border-white/10 bg-white/5 text-muted',
                            ].join(' ')}
                        >
                            {lowerThirdVisible ? 'On' : 'Off'}
                        </span>
                    </div>

                    <label className="grid gap-1 text-sm font-semibold">
                        Text
                        <input
                            className="border border-line px-3 py-2"
                            disabled={!activeLive || isBusy}
                            placeholder="Lower third text"
                            value={lowerThirdText}
                            onChange={(event) => setLowerThirdText(event.target.value)}
                        />
                    </label>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                        <button
                            className="btn-secondary"
                            disabled={!activeLive || isBusy}
                            type="button"
                            onClick={() => void updateLowerThird(true)}
                        >
                            <Type size={16} />
                            Apply text
                        </button>
                        <button
                            className={lowerThirdVisible ? 'btn-danger' : 'btn-primary'}
                            disabled={!activeLive || isBusy}
                            type="button"
                            onClick={() => void updateLowerThird(!lowerThirdVisible)}
                        >
                            {lowerThirdVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                            {lowerThirdVisible ? 'Hide lower third' : 'Show lower third'}
                        </button>
                    </div>

                    {!activeLive ? (
                        <p className="text-sm text-muted">
                            Lower third controls unlock during live.
                        </p>
                    ) : null}
                </section>
            </div>
        </main>
    );
}
