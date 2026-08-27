'use client';

import { useState } from 'react';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Volume2, VolumeX } from 'lucide-react';

export function OperationsPanelMusic() {
    const t = useTranslations('ops.music');
    const [enabled, setEnabled] = useState(false);
    const [volume, setVolume] = useState(50);
    const [fade, setFade] = useState<'short' | 'none'>('short');

    useEffect(() => {
        let cancelled = false;
        fetch('/api/operator/preferences/music', { cache: 'no-store' })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload) => {
                if (!payload || cancelled) {
                    return;
                }
                setEnabled(payload.enabled === true);
                setVolume(Number(payload.volume) || 50);
                setFade(payload.fade === 'none' ? 'none' : 'short');
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void fetch('/api/operator/preferences/music', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-csrf-token': csrfCookie(),
                },
                body: JSON.stringify({ enabled, volume, fade }),
            }).catch(() => undefined);
        }, 350);

        return () => window.clearTimeout(timer);
    }, [enabled, volume, fade]);

    return (
        <div className="space-y-2">
            <label className="flex items-center justify-between gap-2 text-xs text-white/80">
                <span>{t('enabled')}</span>
                <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="accent-accent-positive"
                    aria-label={t('enabled')}
                />
            </label>
            <div className="flex items-center gap-2">
                {enabled ? (
                    <Volume2 size={12} className="text-white/60" aria-hidden="true" />
                ) : (
                    <VolumeX size={12} className="text-white/30" aria-hidden="true" />
                )}
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    disabled={!enabled}
                    aria-label={t('volume')}
                    aria-valuenow={volume}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="flex-1 accent-accent-positive disabled:opacity-30"
                />
                <span className="text-[10px] text-white/40 tabular-nums w-8 text-right">
                    {volume}%
                </span>
            </div>
            <label className="flex items-center justify-between gap-2 text-xs text-white/70">
                <span>{t('fade')}</span>
                <select
                    value={fade}
                    onChange={(event) => setFade(event.target.value === 'none' ? 'none' : 'short')}
                    disabled={!enabled}
                    className="rounded border border-white/10 bg-surface-elevated-2 px-2 py-1 text-[11px] text-white disabled:opacity-30"
                    aria-label={t('fade')}
                >
                    <option value="short">{t('fadeShort')}</option>
                    <option value="none">{t('fadeNone')}</option>
                </select>
            </label>
        </div>
    );
}

function csrfCookie() {
    return (
        document.cookie
            .split('; ')
            .find((part) => part.startsWith('broadcast-planner_csrf='))
            ?.split('=')[1] ?? ''
    );
}
