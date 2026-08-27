'use client';

import { useEffect, useState } from 'react';

import { formatTimecode } from '@/lib/helpers/time';

type MonitorPayload = {
    generatedAt: string;
    timezone: string;
    serverSeconds: number;
    day: { airDate: string; status: string } | null;
    block: {
        title: string;
        status: string;
        elapsedInBlock: number;
        durationSeconds: number;
    } | null;
    asset: {
        id?: string;
        title: string;
        sourceType: string;
        status: string;
        lifecycleState: string;
        playbackReadinessStatus: string;
        playbackError: string | null;
    } | null;
    fallback: { title: string } | null;
    fallbackReason: string | null;
    override: {
        id: string;
        sourceType: string;
        label: string | null;
        streamProtocol: string | null;
        expiresAt: string | null;
    } | null;
    mediaError: string | null;
};

export function OutputMonitorPanel({ initial }: { initial: MonitorPayload }) {
    const [payload, setPayload] = useState(initial);
    const [clientSeconds, setClientSeconds] = useState(initial.serverSeconds);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setClientSeconds((value) => value + 1);
        }, 1000);

        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const refresh = async () => {
            try {
                const response = await fetch('/api/output/monitor', { cache: 'no-store' });

                if (!response.ok) {
                    throw new Error(`Monitor returned ${response.status}`);
                }
                const next = (await response.json()) as MonitorPayload;

                if (cancelled) {
                    return;
                }
                setPayload(next);
                setClientSeconds(next.serverSeconds);
                setError(null);
            } catch (refreshError) {
                if (!cancelled) {
                    setError(
                        refreshError instanceof Error
                            ? refreshError.message
                            : 'Monitor refresh failed',
                    );
                }
            }
        };
        const timer = window.setInterval(refresh, 2000);
        void refresh();

        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [payload.asset?.id]);

    const clockSkew = Math.abs(clientSeconds - payload.serverSeconds);
    const elapsed = payload.block?.elapsedInBlock ?? 0;
    const duration = payload.block?.durationSeconds ?? 0;
    const progress = duration > 0 ? Math.min(100, Math.max(0, (elapsed / duration) * 100)) : 0;

    return (
        <div className="grid gap-3">
            <section className="overflow-hidden border border-line-strong bg-panel">
                <div className="flex min-h-10 items-center justify-between border-b border-line bg-surface px-3">
                    <div className="flex items-center gap-2">
                        <span
                            className={[
                                'h-2 w-2 rounded-full',
                                payload.block ? 'bg-danger animate-pulse' : 'bg-success',
                            ].join(' ')}
                        />
                        <p className="technical-label text-ink">
                            {payload.block ? 'PGM OUT' : 'OUTPUT STANDBY'}
                        </p>
                    </div>
                    <span className="font-technical text-xs text-accent-positive">
                        {formatTimecode(clientSeconds)}
                    </span>
                </div>
                <div className="relative grid min-h-56 place-items-center overflow-hidden bg-black p-6 text-center">
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 opacity-30"
                        style={{
                            backgroundImage:
                                'linear-gradient(rgba(143,179,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(143,179,255,.12) 1px, transparent 1px)',
                            backgroundSize: '32px 32px',
                        }}
                    />
                    <div className="relative max-w-xl">
                        <p className="technical-label text-muted">
                            {payload.asset?.sourceType ?? payload.fallbackReason ?? 'No source'}
                        </p>
                        <h3 className="mt-3 font-display text-2xl font-semibold text-ink">
                            {payload.block?.title ?? payload.fallback?.title ?? 'No active block'}
                        </h3>
                        <p className="mt-3 font-technical text-sm text-accent-positive">
                            {payload.block
                                ? `${formatTimecode(elapsed)} / ${formatTimecode(duration)}`
                                : 'READY FOR PROGRAM'}
                        </p>
                    </div>
                </div>
                <div className="h-1 bg-surface-high">
                    <div className="h-full bg-accent-positive" style={{ width: `${progress}%` }} />
                </div>
                <div className="grid gap-2 border-t border-line bg-surface px-3 py-3 sm:grid-cols-3">
                    <MetricLine label="Source" value={payload.asset?.title ?? 'none'} />
                    <MetricLine label="Fallback" value={payload.fallback?.title ?? 'none'} />
                    <MetricLine
                        label="Signal"
                        value={payload.mediaError ? 'needs attention' : 'ready'}
                    />
                </div>
            </section>
            {payload.day ? (
                <div className="grid gap-2 border border-info-line bg-info-soft p-3">
                    <p className="technical-label text-info-strong">Browser output</p>
                    <p className="truncate text-xs text-muted" aria-live="polite">
                        Open `/output/live`, click Start Output once, and capture the browser in
                        OBS/vMix.
                    </p>
                </div>
            ) : null}
            <details className="border border-line bg-panel-soft p-3">
                <summary className="cursor-pointer font-display text-sm font-semibold">
                    Signal diagnostics
                </summary>
                <dl className="mt-3 grid gap-2 text-[11px]">
                    <MetricLine label="Day" value={payload.day?.airDate ?? 'none'} />
                    <MetricLine label="Day status" value={payload.day?.status ?? 'none'} />
                    <MetricLine label="Block" value={payload.block?.title ?? 'none'} />
                    <MetricLine
                        label="Elapsed"
                        value={
                            payload.block
                                ? `${formatTimecode(payload.block.elapsedInBlock)} / ${formatTimecode(payload.block.durationSeconds)}`
                                : 'n/a'
                        }
                    />
                    <MetricLine label="Asset" value={payload.asset?.title ?? 'none'} />
                    <MetricLine label="Asset status" value={payload.asset?.status ?? 'n/a'} />
                    <MetricLine label="Lifecycle" value={payload.asset?.lifecycleState ?? 'n/a'} />
                    <MetricLine label="Fallback" value={payload.fallback?.title ?? 'none'} />
                    <MetricLine
                        label="Fallback reason"
                        value={payload.fallbackReason ?? 'normal'}
                    />
                    <MetricLine
                        label="Override"
                        value={
                            payload.override
                                ? `${payload.override.label ?? payload.override.sourceType} (${payload.override.streamProtocol ?? 'source'})`
                                : 'none'
                        }
                    />
                    <MetricLine
                        label="Verification"
                        value={payload.asset?.playbackReadinessStatus ?? 'n/a'}
                    />
                    <MetricLine
                        label="Media error"
                        value={payload.mediaError ?? payload.asset?.playbackError ?? 'none'}
                    />
                    <MetricLine label="Clock skew" value={`${clockSkew}s`} />
                    <MetricLine
                        label="Monitor"
                        value={error ?? `ok ${new Date(payload.generatedAt).toLocaleTimeString()}`}
                    />
                </dl>
            </details>
        </div>
    );
}

function MetricLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-white/35">{label}</dt>
            <dd className="min-w-0 truncate text-right font-medium text-white/75">{value}</dd>
        </div>
    );
}
