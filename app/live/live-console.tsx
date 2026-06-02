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
    const [date, setDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [title, setTitle] = useState('');
    const [liveSourceType, setLiveSourceType] = useState<'youtube' | 'hls'>('youtube');
    const [liveUrl, setLiveUrl] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [pending, setPending] = useState(false);
    const statusUrl = useMemo(() => {
        const params = new URLSearchParams();

        if (date) {
            params.set('date', date);
        }

        if (startTime) {
            params.set('startTime', startTime);
        }

        return `/api/live/status${params.size ? `?${params.toString()}` : ''}`;
    }, [date, startTime]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            const response = await fetch(statusUrl, { cache: 'no-store' });
            const payload = (await response.json()) as LiveStatus & { error?: string };

            if (cancelled) {
                return;
            }

            if (!response.ok) {
                setError(payload.error || 'No se pudo leer live status');

                return;
            }
            setStatus(payload);
            setDate((current) => current || payload.currentAirDate);
            setStartTime((current) => current || payload.currentTime.slice(0, 5));
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
                body: JSON.stringify({ date, startTime, title, liveSourceType, liveUrl }),
            });
            const payload = (await response.json()) as { ok?: boolean; error?: string };

            if (!response.ok) {
                throw new Error(payload.error || 'No se pudo mandar live');
            }
            setMessage('Live enviado');
            setLiveUrl('');
            await refreshStatus();
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'No se pudo mandar live');
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
                body: JSON.stringify({ blockId: status.active?.live ? status.active.blockId : '' }),
            });
            const payload = (await response.json()) as { ok?: boolean; error?: string };

            if (!response.ok) {
                throw new Error(payload.error || 'No se pudo cancelar live');
            }
            setMessage('Live cancelado');
            await refreshStatus();
        } catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : 'No se pudo cancelar live');
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

    return (
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-5 py-8">
            <header>
                <p className="eyebrow text-signal">Live override</p>
                <h1 className="mt-2 text-3xl font-semibold">Mandar live</h1>
                <p className="mt-2 text-sm text-muted">
                    Hora actual {status.currentTime || '--:--:--'} · {status.timezone || 'playout'}
                </p>
            </header>

            <section className="surface-panel p-4">
                <p className="text-sm font-semibold">Ahora</p>
                <p className="mt-1 text-lg">
                    {status.active
                        ? `${status.active.live ? 'LIVE: ' : ''}${status.active.title}`
                        : 'Fallback / sin bloque activo'}
                </p>
                <button
                    className="btn-danger mt-4"
                    disabled={pending || !status.active?.live}
                    type="button"
                    onClick={() => void cancelLive()}
                >
                    Cancelar live
                </button>
            </section>

            <form
                className="surface-panel grid gap-4 p-4"
                onSubmit={(event) => void sendLive(event)}
            >
                <label className="grid gap-1 text-sm font-semibold">
                    URL live
                    <input
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
                    Titulo
                    <input
                        placeholder="Live"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                    />
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                    <label className="grid gap-1 text-sm font-semibold">
                        Tipo
                        <select
                            value={liveSourceType}
                            onChange={(event) =>
                                setLiveSourceType(event.target.value === 'hls' ? 'hls' : 'youtube')
                            }
                        >
                            <option value="youtube">YouTube</option>
                            <option value="hls">HLS</option>
                        </select>
                    </label>
                    <label className="grid gap-1 text-sm font-semibold">
                        Dia
                        <input
                            required
                            type="date"
                            value={date}
                            onChange={(event) => setDate(event.target.value)}
                        />
                    </label>
                    <label className="grid gap-1 text-sm font-semibold">
                        Hora
                        <input
                            required
                            type="time"
                            value={startTime}
                            onChange={(event) => setStartTime(event.target.value)}
                        />
                    </label>
                </div>

                {affected.length ? (
                    <div className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                        <p className="font-semibold">
                            Este live pisa programacion desde {startTime || '--:--'} hasta cancelar.
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
                        No pisa bloques programados conocidos.
                    </div>
                )}

                {error ? <p className="text-sm font-semibold text-red-300">{error}</p> : null}
                {message ? (
                    <p className="text-sm font-semibold text-emerald-300">{message}</p>
                ) : null}

                <button className="btn-primary" disabled={pending} type="submit">
                    Send
                </button>
            </form>
        </main>
    );
}
