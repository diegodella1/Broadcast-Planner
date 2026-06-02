'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useActiveBlock } from '@/app/hooks/use-active-block';
import { BlockBadge } from '@/components/schedule/block-badge';
import { formatTimecode } from '@/lib/helpers/time';

export function OperationsPanelOnAir() {
    const t = useTranslations();
    const { data } = useActiveBlock();
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const active = data?.active ?? null;

    if (!active) {
        return (
            <div aria-live="polite" className="text-xs text-white/40">
                {t('schedule.noActiveBlock')}
            </div>
        );
    }

    const pct = Math.min(
        100,
        Math.max(
            0,
            Math.round((active.elapsedInBlock / Math.max(1, active.durationSeconds)) * 100),
        ),
    );

    return (
        <div aria-live="polite" className="space-y-2">
            <div className="flex items-center gap-2">
                <BlockBadge
                    category={active.blockCategory}
                    label={t(`block.category.${active.blockCategory}`)}
                    size="sm"
                />
                <span className="text-sm text-white/90 truncate">{active.blockTitle}</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-sm bg-white/10">
                <div
                    className="h-full bg-accent-positive transition-[width]"
                    style={{ width: `${pct}%` }}
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    role="progressbar"
                />
            </div>
            <div className="flex justify-between text-[10px] text-white/50 tabular-nums">
                <span>{formatTimecode(active.elapsedInBlock)}</span>
                <span>{formatTimecode(active.durationSeconds)}</span>
            </div>
            {active.live ? (
                <div className="rounded-sm border border-white/10 bg-white/[0.03] p-2 text-[10px] text-white/60">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold uppercase text-accent-positive">
                            Live {active.live.sourceType}
                        </span>
                        <button
                            type="button"
                            className="rounded-sm border border-danger-line bg-danger-soft px-2 py-1 font-semibold text-danger-strong disabled:opacity-60"
                            disabled={isPending}
                            onClick={() => {
                                setError(null);
                                startTransition(async () => {
                                    const response = await fetch('/api/output/live/end', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            blockId: active.blockId,
                                            reason: 'manual',
                                        }),
                                    });

                                    if (!response.ok) {
                                        setError(`End live failed (${response.status})`);
                                    }
                                });
                            }}
                        >
                            End live now
                        </button>
                    </div>
                    <p className="mt-1 truncate">{active.live.url}</p>
                    <p className="mt-1">
                        Auto-end is conservative for third-party YouTube. End manually if the live
                        rolls into prerecorded playback.
                    </p>
                    {error ? <p className="mt-1 text-danger-strong">{error}</p> : null}
                </div>
            ) : null}
        </div>
    );
}
