import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OutputMonitorPanel } from './output-monitor-panel';

describe('OutputMonitorPanel', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        global.fetch = vi.fn(async () => {
            return jsonResponse(initialPayload);
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows browser output capture guidance and refreshes diagnostics', async () => {
        render(<OutputMonitorPanel initial={initialPayload} />);

        expect(screen.getByText('Browser output')).toBeInTheDocument();
        expect(
            screen.getByText(
                'Open `/output/live`, click Start Output once, and capture the browser in OBS/vMix.',
            ),
        ).toBeInTheDocument();

        await waitFor(() =>
            expect(global.fetch).toHaveBeenCalledWith('/api/output/monitor', { cache: 'no-store' }),
        );
    });
});

function jsonResponse(payload: unknown) {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

const initialPayload = {
    generatedAt: '2026-05-15T14:30:00Z',
    timezone: 'America/Los_Angeles',
    serverSeconds: 27000,
    day: { airDate: '2026-05-15', status: 'active' },
    block: {
        title: 'Roxom Report',
        status: 'ready',
        elapsedInBlock: 1800,
        durationSeconds: 3600,
    },
    asset: {
        id: 'asset-vimeo',
        title: 'Roxom Report',
        sourceType: 'vimeo',
        status: 'ready',
        lifecycleState: 'reviewed',
        playbackReadinessStatus: 'ready',
        playbackError: null,
    },
    fallback: null,
    fallbackReason: null,
    override: null,
    mediaError: null,
};
