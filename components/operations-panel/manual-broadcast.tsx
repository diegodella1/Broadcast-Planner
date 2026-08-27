'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';

import { goLiveReutersAction, scheduleReutersAction } from '@/app/admin/output/actions';

type Mode = 'now' | 'scheduled';

type ReutersChannelRow = {
    id: string;
    name: string;
    description?: string;
    category?: string | null;
    assetId: string | null;
};

export function OperationsPanelManualBroadcast() {
    const t = useTranslations('ops.manualBroadcast');
    const [channels, setChannels] = useState<ReutersChannelRow[]>([]);
    const [query, setQuery] = useState('');
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>('now');
    const [startAt, setStartAt] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        const controller = new AbortController();

        void loadChannels(controller.signal);

        return () => controller.abort();
    }, []);

    async function loadChannels(signal?: AbortSignal, sync = false) {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/reuters/sync', {
                method: sync ? 'POST' : 'GET',
                ...(signal ? { signal } : {}),
                cache: 'no-store',
            });

            if (!response.ok) {
                throw new Error(`Reuters channels failed: ${response.status}`);
            }
            const data = (await response.json()) as { channels: ReutersChannelRow[] };
            setChannels(data.channels ?? []);
        } catch (loadError) {
            if (loadError instanceof Error && loadError.name === 'AbortError') {
                return;
            }
            setError(loadError instanceof Error ? loadError.message : 'Reuters channels failed');
        } finally {
            setLoading(false);
        }
    }

    const filtered = channels.filter((channel) =>
        [channel.name, channel.description, channel.category]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(query.toLowerCase()),
    );

    function commit() {
        if (!selectedAssetId) {
            return;
        }
        setError(null);
        setSuccess(false);

        startTransition(async () => {
            const result =
                mode === 'now'
                    ? await goLiveReutersAction({ assetId: selectedAssetId })
                    : await scheduleReutersAction({ assetId: selectedAssetId, startAt });

            if (!result.success) {
                setError(result.error);

                return;
            }
            setSuccess(true);
            setSelectedAssetId(null);
            setStartAt('');
        });
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1">
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('reutersChannels')}
                    className="flex-1 rounded-sm border border-white/10 bg-surface-elevated-2 px-2 py-1 text-xs text-white/80"
                />
                <button
                    type="button"
                    onClick={() => void loadChannels(undefined, true)}
                    disabled={loading || isPending}
                    className="rounded-sm border border-white/10 bg-surface-elevated-2 px-2 py-1 text-[10px] text-white/70 disabled:opacity-30"
                >
                    {loading ? t('searching') : t('syncChannels')}
                </button>
            </div>

            <ul
                role="listbox"
                aria-label="Reuters channels"
                className="max-h-40 space-y-1 overflow-y-auto"
            >
                {filtered.map((channel) => (
                    <li key={channel.id}>
                        <button
                            type="button"
                            role="option"
                            aria-selected={selectedAssetId === channel.assetId}
                            onClick={() => channel.assetId && setSelectedAssetId(channel.assetId)}
                            disabled={!channel.assetId || isPending}
                            className={[
                                'flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs',
                                selectedAssetId === channel.assetId
                                    ? 'bg-surface-selected-positive text-accent-positive'
                                    : 'text-white/70 hover:bg-surface-elevated-2',
                                'disabled:cursor-not-allowed disabled:opacity-30',
                            ].join(' ')}
                        >
                            <span className="flex-1 truncate">{channel.name}</span>
                            <span className="text-[10px] uppercase opacity-60">
                                {channel.category ?? ''}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>

            <div className="flex gap-1 text-[10px]">
                {(['now', 'scheduled'] as const).map((value) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setMode(value)}
                        className={[
                            'flex-1 rounded-sm border px-2 py-1',
                            mode === value
                                ? 'border-accent-positive bg-surface-selected-positive text-accent-positive'
                                : 'border-white/10 bg-surface-elevated-2 text-white/60',
                        ].join(' ')}
                    >
                        {value === 'now' ? t('modeNow') : t('modeScheduled')}
                    </button>
                ))}
            </div>

            {mode === 'scheduled' ? (
                <input
                    type="time"
                    value={startAt}
                    onChange={(event) => setStartAt(event.target.value)}
                    className="w-full rounded-sm border border-white/10 bg-surface-elevated-2 px-2 py-1 text-xs text-white/80"
                />
            ) : null}

            {error ? <p className="text-[10px] text-negative-red">{error}</p> : null}
            {success ? <p className="text-[10px] text-accent-positive">{t('success')}</p> : null}

            <button
                type="button"
                onClick={commit}
                disabled={isPending || !selectedAssetId || (mode === 'scheduled' && !startAt)}
                className="w-full rounded-sm bg-accent-positive px-3 py-1.5 text-xs font-semibold text-surface-elevated-1 disabled:opacity-30"
            >
                {mode === 'now' ? t('goLive') : t('schedule')}
            </button>
        </div>
    );
}
