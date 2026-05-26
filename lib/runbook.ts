import type { RunbookSectionDefinition } from './types';

export const RUNBOOK_TEMPLATE: RunbookSectionDefinition[] = [
    {
        section: 'preflight',
        title: 'Preflight',
        items: [
            {
                key: 'health-green',
                label: 'Schedule health checked',
                detail: 'No critical gaps, overlaps, missing media or unsupported primary assets.',
                critical: true,
            },
            {
                key: 'fallback-ready',
                label: 'Fallback ready',
                detail: 'Current day or system fallback media is ready and visible in output monitor.',
                critical: true,
            },
            {
                key: 'output-monitor-open',
                label: 'Output monitor open',
                detail: 'Operator has the output monitor visible with block, asset, fallback and errors.',
                critical: true,
            },
            {
                key: 'audio-video-check',
                label: 'Audio/video checked',
                detail: 'Primary playout path has visible video and expected audio route.',
            },
            {
                key: 'vimeo-storage-ready',
                label: 'Vimeo and storage ready',
                detail: 'Vimeo playback readiness and Supabase media URLs are healthy.',
            },
        ],
    },
    {
        section: 'live',
        title: 'Live',
        items: [
            {
                key: 'active-block-verified',
                label: 'Active block verified',
                detail: 'Current block, asset title and elapsed time match the rundown.',
            },
            {
                key: 'next-block-verified',
                label: 'Next block verified',
                detail: 'Next block is ready and does not require manual intervention.',
            },
            {
                key: 'fallback-intentional',
                label: 'Fallback state intentional',
                detail: 'Any fallback reason shown in monitor is expected or being handled.',
            },
            {
                key: 'clock-skew-clear',
                label: 'Clock skew clear',
                detail: 'Output clock is close enough to operator clock for live switching.',
            },
        ],
    },
    {
        section: 'incident',
        title: 'Incident',
        items: [
            {
                key: 'incident-note-written',
                label: 'Incident note written',
                detail: 'Operator note records what failed, when it started and what was affected.',
            },
            {
                key: 'mitigation-confirmed',
                label: 'Mitigation confirmed',
                detail: 'Fallback, replacement block or manual hold is visible in output.',
            },
        ],
    },
    {
        section: 'shutdown',
        title: 'Shutdown',
        items: [
            {
                key: 'output-off-air',
                label: 'Output off-air or handed off',
                detail: 'Operator confirms no unintended live media is playing.',
            },
            {
                key: 'day-archived',
                label: 'Day archived when finished',
                detail: 'Programming day is archived or left in the expected status.',
            },
            {
                key: 'audit-reviewed',
                label: 'Audit reviewed',
                detail: 'Important changes and incidents are represented in the audit log.',
            },
        ],
    },
];

export function criticalRunbookKeys() {
    return new Set(
        RUNBOOK_TEMPLATE.flatMap((section) =>
            section.items
                .filter((item) => item.critical)
                .map((item) => `${section.section}:${item.key}`),
        ),
    );
}
