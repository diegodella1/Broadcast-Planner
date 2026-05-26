import { findScheduleConflicts, type ScheduleConflict } from './schedule-conflicts';
import { formatTimecode } from '../helpers/time';

import type { ProgramBlock, ProgramStatus } from '../types';

export type ScheduleMutationMode = 'insert_shift' | 'replace_window' | 'strict';

export type SchedulePlanCandidate = {
    id?: string;
    programDayId: string;
    startTimeSeconds: number;
    durationSeconds: number;
    status?: ProgramStatus;
};

export type ScheduleBlockShift = {
    id: string;
    title: string;
    previousStartTimeSeconds: number;
    startTimeSeconds: number;
    startTime: string;
    status: ProgramStatus;
};

export type ScheduleMutationPlan = {
    mode: ScheduleMutationMode;
    finalCandidate: SchedulePlanCandidate;
    conflicts: ScheduleConflict[];
    blocksToArchive: ScheduleConflict[];
    blocksToShift: ScheduleBlockShift[];
    warnings: string[];
};

const DAY_SECONDS = 86400;

export function planScheduleMutation({
    blocks,
    candidate,
    mode = 'insert_shift',
}: {
    blocks: ProgramBlock[];
    candidate: SchedulePlanCandidate;
    mode?: ScheduleMutationMode;
}): ScheduleMutationPlan {
    const durationSeconds = Math.max(1, Math.floor(Number(candidate.durationSeconds || 0)));
    const startTimeSeconds = Math.max(0, Math.floor(Number(candidate.startTimeSeconds || 0)));
    const finalCandidate = { ...candidate, startTimeSeconds, durationSeconds };
    const candidateEnd = startTimeSeconds + durationSeconds;

    if (candidateEnd > DAY_SECONDS) {
        throw new Error('El bloque excede las 24 horas del dia');
    }

    if (candidate.status === 'archived') {
        return emptyPlan(mode, finalCandidate);
    }

    const activeBlocks = blocks
        .filter((block) => block.programDayId === candidate.programDayId)
        .filter((block) => block.status !== 'archived')
        .filter((block) => block.id !== candidate.id)
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    const conflict = findScheduleConflicts(activeBlocks, finalCandidate);

    if (mode === 'strict' && conflict.hasConflict) {
        throw new Error('El bloque se solapa con otro bloque');
    }

    if (mode === 'replace_window') {
        return {
            mode,
            finalCandidate,
            conflicts: conflict.conflicts,
            blocksToArchive: conflict.conflicts,
            blocksToShift: [],
            warnings: conflict.conflicts.length
                ? [`Se archivaran ${conflict.conflicts.length} bloque(s) solapados`]
                : [],
        };
    }

    const blocksToShift = buildInsertShiftPlan(activeBlocks, finalCandidate);

    return {
        mode,
        finalCandidate,
        conflicts: conflict.conflicts,
        blocksToArchive: [],
        blocksToShift,
        warnings: blocksToShift.length ? [`Se moveran ${blocksToShift.length} bloque(s)`] : [],
    };
}

export function previewInsertShift({
    blocks,
    candidate,
}: {
    blocks: ProgramBlock[];
    candidate: SchedulePlanCandidate;
}) {
    return planScheduleMutation({ blocks, candidate, mode: 'insert_shift' });
}

function buildInsertShiftPlan(
    blocks: ProgramBlock[],
    candidate: SchedulePlanCandidate,
): ScheduleBlockShift[] {
    let cursor = candidate.startTimeSeconds + candidate.durationSeconds;
    const affected = blocks.filter(
        (block) => block.startTimeSeconds + block.durationSeconds > candidate.startTimeSeconds,
    );
    const shifts: ScheduleBlockShift[] = [];

    for (const block of affected) {
        const nextStart = Math.max(cursor, block.startTimeSeconds);
        const nextEnd = nextStart + block.durationSeconds;

        if (nextEnd > DAY_SECONDS) {
            throw new Error('El auto-insert empuja la grilla mas alla de las 24 horas');
        }

        if (nextStart !== block.startTimeSeconds) {
            shifts.push({
                id: block.id,
                title: block.title,
                previousStartTimeSeconds: block.startTimeSeconds,
                startTimeSeconds: nextStart,
                startTime: formatTimecode(nextStart),
                status: block.status,
            });
        }
        cursor = nextEnd;
    }

    return shifts;
}

function emptyPlan(
    mode: ScheduleMutationMode,
    finalCandidate: SchedulePlanCandidate,
): ScheduleMutationPlan {
    return {
        mode,
        finalCandidate,
        conflicts: [],
        blocksToArchive: [],
        blocksToShift: [],
        warnings: [],
    };
}
