import { describe, expect, it } from 'vitest';
import {
    ACTIVE_BLOCK_BACKOFF_THRESHOLD,
    ACTIVE_BLOCK_MAX_INTERVAL_MS,
    nextPollState,
} from './use-active-block-backoff';

const BASE = 5000;

describe('nextPollState', () => {
    it('resets interval and error count on success', () => {
        const result = nextPollState({ intervalMs: 40_000, consecutiveErrors: 5 }, 'success', BASE);
        expect(result).toEqual({ intervalMs: BASE, consecutiveErrors: 0 });
    });

    it('keeps base interval while errors are below threshold', () => {
        let state = { intervalMs: BASE, consecutiveErrors: 0 };

        for (let i = 1; i < ACTIVE_BLOCK_BACKOFF_THRESHOLD; i++) {
            state = nextPollState(state, 'error', BASE);
            expect(state.intervalMs).toBe(BASE);
            expect(state.consecutiveErrors).toBe(i);
        }
    });

    it('doubles interval starting at the threshold and caps at max', () => {
        let state = { intervalMs: BASE, consecutiveErrors: 0 };
        // First two errors keep base interval (threshold is 3)
        state = nextPollState(state, 'error', BASE); // 1
        state = nextPollState(state, 'error', BASE); // 2
        expect(state.intervalMs).toBe(BASE);

        // 3rd error: first doubling
        state = nextPollState(state, 'error', BASE);
        expect(state.intervalMs).toBe(BASE * 2);
        expect(state.consecutiveErrors).toBe(3);

        // 4th error: doubles again
        state = nextPollState(state, 'error', BASE);
        expect(state.intervalMs).toBe(BASE * 4);

        // Continue until cap
        for (let i = 0; i < 20; i++) {
            state = nextPollState(state, 'error', BASE);
        }
        expect(state.intervalMs).toBe(ACTIVE_BLOCK_MAX_INTERVAL_MS);
    });

    it('never exceeds the documented max interval of 60s', () => {
        let state = { intervalMs: BASE, consecutiveErrors: 0 };

        for (let i = 0; i < 100; i++) {
            state = nextPollState(state, 'error', BASE);
        }
        expect(state.intervalMs).toBeLessThanOrEqual(ACTIVE_BLOCK_MAX_INTERVAL_MS);
    });

    it('returns to base interval immediately on success after backoff', () => {
        let state = { intervalMs: BASE, consecutiveErrors: 0 };

        for (let i = 0; i < 5; i++) {
            state = nextPollState(state, 'error', BASE);
        }
        expect(state.intervalMs).toBeGreaterThan(BASE);
        state = nextPollState(state, 'success', BASE);
        expect(state).toEqual({ intervalMs: BASE, consecutiveErrors: 0 });
    });
});
