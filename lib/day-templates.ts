import { formatTimecode, parseTimecode } from './time';

import type { BlockCategory, BlockType } from './types';

export type DayTemplateSlot = {
    title: string;
    blockType: BlockType;
    category: BlockCategory;
    startOffsetSeconds: number;
    durationSeconds: number;
};

export type DayTemplate = {
    id: string;
    name: string;
    description: string;
    slots: DayTemplateSlot[];
};

export type TemplateBlockDraft = DayTemplateSlot & {
    startTime: string;
    startTimeSeconds: number;
};

export const DAY_TEMPLATES = [
    {
        id: 'standard-market-day',
        name: 'Standard Market Day',
        description: 'Morning open, market updates, video blocks, ads and fallback-safe breaks.',
        slots: [
            slot('Opening', 'slide', 'mercados', 0, 300),
            slot('Market video 1', 'video', 'mercados', 300, 1800),
            slot('Ad break 1', 'ad', 'broadcast', 2100, 180),
            slot('Markets board', 'slide', 'mercados', 2280, 600),
            slot('Market video 2', 'video', 'mercados', 2880, 1800),
            slot('Promo', 'promo', 'broadcast', 4680, 300),
            slot('Calendar / debt board', 'slide', 'calendario', 4980, 600),
            slot('Closing video', 'video', 'broadcast', 5580, 1800),
            slot('Fallback bumper', 'fallback', 'broadcast', 7380, 300),
        ],
    },
    {
        id: 'short-test-day',
        name: 'Short Test Day',
        description: 'Fast smoke grid for output checks before longer programming.',
        slots: [
            slot('Test slate', 'slide', 'broadcast', 0, 120),
            slot('Test video', 'video', 'broadcast', 120, 600),
            slot('Test ad', 'ad', 'broadcast', 720, 60),
            slot('Fallback test', 'fallback', 'broadcast', 780, 180),
        ],
    },
    {
        id: 'live-event-day',
        name: 'Live Event Day',
        description: 'Simple event rundown with pre-roll, program, promos and fallback.',
        slots: [
            slot('Pre-show slate', 'slide', 'broadcast', 0, 600),
            slot('Main event', 'video', 'broadcast', 600, 3600),
            slot('Ad break', 'ad', 'broadcast', 4200, 180),
            slot('Post-show video', 'video', 'broadcast', 4380, 1200),
            slot('Fallback bumper', 'fallback', 'broadcast', 5580, 300),
        ],
    },
] as const satisfies readonly DayTemplate[];

export function getDayTemplate(templateId: string) {
    return DAY_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function buildTemplateBlocks(
    template: DayTemplate,
    startTime: string,
): TemplateBlockDraft[] {
    const startSeconds = parseTimecode(startTime);

    return template.slots.map((templateSlot) => {
        const startTimeSeconds = startSeconds + templateSlot.startOffsetSeconds;

        return {
            ...templateSlot,
            startTimeSeconds,
            startTime: formatTimecode(startTimeSeconds),
        };
    });
}

function slot(
    title: string,
    blockType: BlockType,
    category: BlockCategory,
    startOffsetSeconds: number,
    durationSeconds: number,
) {
    return { title, blockType, category, startOffsetSeconds, durationSeconds };
}
