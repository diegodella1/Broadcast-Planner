import type { SourceType } from '../types';

export type DurationDisplay = { kind: 'live' } | { kind: 'duration'; seconds: number };

/**
 * Decides whether a duration chip should render as the literal "Live" label
 * (for streaming sources without a fixed duration) or as a numeric duration.
 *
 * Pure helper: no I/O, no async, no React. The caller is responsible for
 * rendering the result (translating `block.live` for `kind: "live"`, or
 * formatting `seconds` via `formatTimecode` for `kind: "duration"`).
 *
 * Only `sourceType === "reuters"` qualifies as a live stream for now. Other
 * unknown durations fall through to a 0-second numeric path so the caller
 * always has a numeric branch available.
 */
export function getDurationDisplay(input: {
    durationSeconds: number | null;
    sourceType: SourceType;
}): DurationDisplay {
    if (input.durationSeconds === null && input.sourceType === 'reuters') {
        return { kind: 'live' };
    }

    if (input.durationSeconds === null) {
        return { kind: 'duration', seconds: 0 };
    }

    return { kind: 'duration', seconds: input.durationSeconds };
}
