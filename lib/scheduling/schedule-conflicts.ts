import { formatTimecode } from '../helpers/time';

import type { ProgramBlock } from '../types';

export type ScheduleConflict = {
    blockId: string;
    title: string;
    startTimeSeconds: number;
    endTimeSeconds: number;
};

export type ScheduleConflictResult = {
    hasConflict: boolean;
    conflicts: ScheduleConflict[];
    suggestedStartSeconds: number | null;
    maxSafeDurationSeconds: number | null;
    gapOptions: Array<{
        startTimeSeconds: number;
        durationSeconds: number;
    }>;
};

const DAY_SECONDS = 86400;

export function findScheduleConflicts(
    blocks: ProgramBlock[],
    candidate: {
        id?: string;
        programDayId: string;
        startTimeSeconds: number;
        durationSeconds: number;
    },
): ScheduleConflictResult {
    const candidateEnd = candidate.startTimeSeconds + candidate.durationSeconds;
    const conflicts = blocks
        .filter(
            (block) =>
                block.programDayId === candidate.programDayId &&
                block.id !== candidate.id &&
                block.status !== 'archived',
        )
        .filter((block) => {
            const blockEnd = block.startTimeSeconds + block.durationSeconds;

            return candidate.startTimeSeconds < blockEnd && candidateEnd > block.startTimeSeconds;
        })
        .map((block) => ({
            blockId: block.id,
            title: block.title,
            startTimeSeconds: block.startTimeSeconds,
            endTimeSeconds: block.startTimeSeconds + block.durationSeconds,
        }));

    const gapOptions = findSameDayGaps(blocks, candidate.programDayId);

    return {
        hasConflict: conflicts.length > 0,
        conflicts,
        suggestedStartSeconds: conflicts.length
            ? findNearestSafeStart(
                  blocks,
                  candidate.programDayId,
                  candidate.durationSeconds,
                  candidateEnd,
              )
            : null,
        maxSafeDurationSeconds: findMaxSafeDuration(
            blocks,
            candidate.programDayId,
            candidate.startTimeSeconds,
            candidate.id,
        ),
        gapOptions,
    };
}

export function findNearestSafeStart(
    blocks: ProgramBlock[],
    programDayId: string,
    durationSeconds: number,
    preferredStartSeconds = 0,
) {
    const sorted = blocks
        .filter((block) => block.programDayId === programDayId && block.status !== 'archived')
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    const candidates = [
        preferredStartSeconds,
        0,
        ...sorted.map((block) => block.startTimeSeconds + block.durationSeconds),
    ];

    for (const start of candidates) {
        if (start < 0 || start + durationSeconds > DAY_SECONDS) {
            continue;
        }
        const hasConflict = sorted.some((block) => {
            const blockEnd = block.startTimeSeconds + block.durationSeconds;

            return start < blockEnd && start + durationSeconds > block.startTimeSeconds;
        });

        if (!hasConflict) {
            return start;
        }
    }

    return null;
}

export function scheduleConflictMessage(result: ScheduleConflictResult) {
    if (!result.hasConflict) {
        return '';
    }
    const names = result.conflicts.map((conflict) => conflict.title).join(', ');
    const suggestion =
        result.suggestedStartSeconds === null
            ? 'No safe same-day slot found.'
            : `Try ${formatTimecode(result.suggestedStartSeconds)}.`;

    return `Conflicts with ${names}. ${suggestion}`;
}

export function findMaxSafeDuration(
    blocks: ProgramBlock[],
    programDayId: string,
    startTimeSeconds: number,
    ignoredBlockId?: string,
) {
    if (startTimeSeconds < 0 || startTimeSeconds >= DAY_SECONDS) {
        return null;
    }
    const next = blocks
        .filter(
            (block) =>
                block.programDayId === programDayId &&
                block.id !== ignoredBlockId &&
                block.status !== 'archived',
        )
        .filter((block) => block.startTimeSeconds >= startTimeSeconds)
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)[0];
    const end = next ? next.startTimeSeconds : DAY_SECONDS;

    return Math.max(0, end - startTimeSeconds);
}

export function findSameDayGaps(blocks: ProgramBlock[], programDayId: string) {
    const sorted = blocks
        .filter((block) => block.programDayId === programDayId && block.status !== 'archived')
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    const gaps: Array<{ startTimeSeconds: number; durationSeconds: number }> = [];
    let cursor = 0;

    for (const block of sorted) {
        if (block.startTimeSeconds > cursor) {
            gaps.push({
                startTimeSeconds: cursor,
                durationSeconds: block.startTimeSeconds - cursor,
            });
        }
        cursor = Math.max(cursor, block.startTimeSeconds + block.durationSeconds);
    }

    if (cursor < DAY_SECONDS) {
        gaps.push({ startTimeSeconds: cursor, durationSeconds: DAY_SECONDS - cursor });
    }

    return gaps;
}
