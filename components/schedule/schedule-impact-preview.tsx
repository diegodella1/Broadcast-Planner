'use client';

import { findScheduleConflicts } from '@/lib/schedule-conflicts';
import { previewInsertShift } from '@/lib/schedule-planner';
import { formatPlayoutTimeLabel } from '@/lib/time';

type ScheduleImpactPreviewProps = {
    conflict: ReturnType<typeof findScheduleConflicts> | null;
    insertPreview: ReturnType<typeof previewInsertShift> | null;
    exceedsDay: boolean;
};

export function ScheduleImpactPreview({
    conflict,
    insertPreview,
    exceedsDay,
}: ScheduleImpactPreviewProps) {
    if (exceedsDay) {
        return (
            <div className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong">
                <p className="font-semibold">Does not fit today</p>
                <p className="mt-1 text-xs opacity-85">Start earlier or shorten the duration.</p>
            </div>
        );
    }

    if (conflict?.hasConflict) {
        const shifted = insertPreview?.blocksToShift ?? [];

        return (
            <div className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn-strong">
                <p className="text-[10px] font-bold uppercase">Impact</p>
                <p className="mt-1 font-semibold">Overlaps {conflict.conflicts.length} block(s)</p>
                {shifted.length ? (
                    <p className="mt-1 text-xs opacity-85">
                        Make room will move {shifted.length} block{shifted.length === 1 ? '' : 's'}.
                        Last affected starts at{' '}
                        {formatPlayoutTimeLabel(
                            shifted[shifted.length - 1]?.startTimeSeconds ?? 0,
                            true,
                        )}
                        .
                    </p>
                ) : (
                    <p className="mt-1 text-xs opacity-85">
                        Choose how to handle the overlap below.
                    </p>
                )}
            </div>
        );
    }

    if (insertPreview?.blocksToShift.length) {
        return (
            <div className="rounded-md border border-info-line bg-info-soft px-3 py-2 text-sm text-info-strong">
                <p className="text-[10px] font-bold uppercase">Impact</p>
                <p className="mt-1 font-semibold">
                    Make room will move {insertPreview.blocksToShift.length} following block
                    {insertPreview.blocksToShift.length === 1 ? '' : 's'}.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-md border border-success-line bg-success-soft px-3 py-2 text-sm text-success-strong">
            <p className="text-[10px] font-bold uppercase">Impact</p>
            <p className="mt-1 font-semibold">Fits in the selected time.</p>
        </div>
    );
}
