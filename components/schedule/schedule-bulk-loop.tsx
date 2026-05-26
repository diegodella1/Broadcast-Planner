'use client';

import { arrayMove } from '@dnd-kit/sortable';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ScheduleBundle } from '@/lib/types';

import { DEFAULT_MANUAL_DURATION } from './helpers';

type BulkCardLoopPanelProps = {
    schedule: ScheduleBundle;
    action: (formData: FormData) => Promise<void>;
};

type LoopRow = {
    key: string;
    slideId: string;
    durationSeconds: number;
};

export function BulkCardLoopPanel({ schedule, action }: BulkCardLoopPanelProps) {
    const readySlides = useMemo(
        () =>
            schedule.slideAssets
                .filter((slide) => slide.status === 'ready')
                .sort((a, b) => a.title.localeCompare(b.title)),
        [schedule.slideAssets],
    );
    const [rows, setRows] = useState<LoopRow[]>(() => {
        const first = readySlides[0];

        return [
            {
                key: 'row-1',
                slideId: first?.id ?? '',
                durationSeconds: first?.defaultDurationSeconds ?? DEFAULT_MANUAL_DURATION,
            },
        ];
    });

    function addRow() {
        const first = readySlides[0];
        setRows((current) => [
            ...current,
            {
                key: `row-${Date.now()}-${current.length}`,
                slideId: first?.id ?? '',
                durationSeconds: first?.defaultDurationSeconds ?? DEFAULT_MANUAL_DURATION,
            },
        ]);
    }

    function updateRow(index: number, patch: Partial<LoopRow>) {
        setRows((current) =>
            current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
        );
    }

    function moveRow(index: number, delta: number) {
        setRows((current) => {
            const nextIndex = index + delta;

            if (nextIndex < 0 || nextIndex >= current.length) {
                return current;
            }

            return arrayMove(current, index, nextIndex);
        });
    }

    function removeRow(index: number) {
        setRows((current) =>
            current.length > 1 ? current.filter((_, rowIndex) => rowIndex !== index) : current,
        );
    }

    function chooseSlide(index: number, slideId: string) {
        const slide = readySlides.find((item) => item.id === slideId);
        updateRow(index, {
            slideId,
            durationSeconds:
                slide?.defaultDurationSeconds ??
                rows[index]?.durationSeconds ??
                DEFAULT_MANUAL_DURATION,
        });
    }

    return (
        <details id="bulk-cards" className="border-t border-line bg-panel-soft">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                Loop Builder / Fallback Carousel
            </summary>
            <form action={action} className="grid gap-4 px-4 pb-4">
                <p className="max-w-3xl text-sm leading-6 text-muted">
                    Build one silent slide loop. Choose whether it becomes scheduled blocks, the
                    global visual fallback carousel, or both. The music playlist plays under slide
                    loops and visual fallback.
                </p>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                    <label className="grid gap-1 text-xs font-semibold text-muted">
                        Clock start (24 h)
                        <input
                            name="start_time"
                            required
                            defaultValue="00:00:00"
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-muted">
                        Clock end (24 h)
                        <input
                            name="end_time"
                            required
                            defaultValue="01:00:00"
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        />
                    </label>
                    <label className="flex min-h-10 items-center gap-2 self-end rounded-md border border-line bg-surface px-3 text-sm font-medium">
                        <input name="replace_window" type="checkbox" />
                        Replace window
                    </label>
                </div>

                <div className="grid gap-2">
                    {rows.map((row, index) => (
                        <div
                            key={row.key}
                            className="grid gap-2 rounded-md border border-line bg-surface p-2 md:grid-cols-[72px_minmax(0,1fr)_110px_40px]"
                        >
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    className="grid h-8 w-8 place-items-center rounded-md border border-line"
                                    onClick={() => moveRow(index, -1)}
                                    disabled={index === 0}
                                    aria-label="Move card up"
                                >
                                    <ArrowUp size={14} aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    className="grid h-8 w-8 place-items-center rounded-md border border-line"
                                    onClick={() => moveRow(index, 1)}
                                    disabled={index === rows.length - 1}
                                    aria-label="Move card down"
                                >
                                    <ArrowDown size={14} aria-hidden="true" />
                                </button>
                            </div>
                            <label className="grid gap-1 text-xs font-semibold text-muted">
                                Card
                                <select
                                    name="slide_ids"
                                    required
                                    value={row.slideId}
                                    onChange={(event) => chooseSlide(index, event.target.value)}
                                    className="border border-line px-3 py-2 text-sm font-normal text-ink"
                                >
                                    {readySlides.map((slide) => (
                                        <option key={slide.id} value={slide.id}>
                                            {slide.title}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="grid gap-1 text-xs font-semibold text-muted">
                                Seconds
                                <input
                                    name="durations"
                                    required
                                    type="number"
                                    min="1"
                                    value={row.durationSeconds}
                                    onChange={(event) =>
                                        updateRow(index, {
                                            durationSeconds: Number(event.target.value) || 1,
                                        })
                                    }
                                    className="border border-line px-3 py-2 text-sm font-normal text-ink"
                                />
                            </label>
                            <button
                                type="button"
                                className="grid h-10 w-10 place-items-center self-end rounded-md border border-line bg-surface"
                                onClick={() => removeRow(index)}
                                disabled={rows.length === 1}
                                aria-label="Remove card"
                            >
                                <Trash2 size={15} aria-hidden="true" />
                            </button>
                        </div>
                    ))}
                </div>

                {!readySlides.length ? (
                    <p className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-strong">
                        No ready cards. Create ready slides first.
                    </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={addRow}
                        disabled={!readySlides.length}
                    >
                        <Plus size={15} aria-hidden="true" />
                        Add card
                    </button>
                    <button
                        className="btn-primary"
                        name="loop_mode"
                        value="scheduled"
                        disabled={!readySlides.length}
                    >
                        Create scheduled loop
                    </button>
                    <button
                        className="btn-secondary"
                        name="loop_mode"
                        value="fallback"
                        disabled={!readySlides.length}
                    >
                        Set fallback only
                    </button>
                    <button
                        className="btn-secondary"
                        name="loop_mode"
                        value="both"
                        disabled={!readySlides.length}
                    >
                        Create loop + set fallback
                    </button>
                </div>
            </form>
        </details>
    );
}
