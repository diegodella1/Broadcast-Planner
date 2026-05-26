import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { ACTIVE_BLOCK_BACKOFF_THRESHOLD } from './use-active-block-backoff';
import { useActiveBlock } from './use-active-block';

import type { ActiveBlockSnapshot } from './use-active-block';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const snapshot: ActiveBlockSnapshot = {
    active: {
        blockId: 'block-1',
        blockTitle: 'Morning Markets',
        blockCategory: 'mercados',
        startsAt: 36000,
        durationSeconds: 3600,
        elapsedInBlock: 600,
    },
    dayStatus: 'active',
};

function okResponse(body: ActiveBlockSnapshot = snapshot) {
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
    } as unknown as Response);
}

function errorResponse(status = 503) {
    return Promise.resolve({
        ok: false,
        status,
        json: () => Promise.resolve({}),
    } as unknown as Response);
}

/** Flush all pending microtasks without advancing fake timers. */
async function flushMicrotasks() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useActiveBlock', () => {
    it('starts with isLoading=true and no data before the first fetch resolves', () => {
        vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)));

        const { result } = renderHook(() => useActiveBlock(5000));

        expect(result.current.isLoading).toBe(true);
        expect(result.current.data).toBeNull();
        expect(result.current.error).toBeNull();
    });

    it('sets data and clears loading after the first successful fetch', async () => {
        vi.stubGlobal('fetch', vi.fn().mockReturnValue(okResponse()));

        const { result } = renderHook(() => useActiveBlock(5000));

        // The initial tick fires immediately (no leading setTimeout); flush microtasks
        await flushMicrotasks();

        expect(result.current.isLoading).toBe(false);
        expect(result.current.data).toEqual(snapshot);
        expect(result.current.error).toBeNull();
    });

    it('polls again after the configured interval', async () => {
        const mockFetch = vi.fn().mockReturnValue(okResponse());
        vi.stubGlobal('fetch', mockFetch);

        renderHook(() => useActiveBlock(1000));

        // Flush the first (immediate) tick
        await flushMicrotasks();
        expect(mockFetch).toHaveBeenCalledTimes(1);

        // Advance exactly the poll interval to fire the next setTimeout
        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        await flushMicrotasks();

        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('sets error when the server responds with a non-OK status', async () => {
        vi.stubGlobal('fetch', vi.fn().mockReturnValue(errorResponse(503)));

        const { result } = renderHook(() => useActiveBlock(5000));

        await flushMicrotasks();

        expect(result.current.error).toContain('503');
        expect(result.current.data).toBeNull();
        expect(result.current.isLoading).toBe(false);
    });

    it('sets error on a network-level fetch rejection', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

        const { result } = renderHook(() => useActiveBlock(5000));

        await flushMicrotasks();

        expect(result.current.error).toBe('Network error');
        expect(result.current.isLoading).toBe(false);
    });

    it('resets error to null after a successful fetch following an error', async () => {
        const mockFetch = vi.fn().mockReturnValue(errorResponse(500));
        vi.stubGlobal('fetch', mockFetch);

        const { result } = renderHook(() => useActiveBlock(1000));

        // First tick fails
        await flushMicrotasks();
        expect(result.current.error).not.toBeNull();

        // Swap to a success response for the next poll
        mockFetch.mockReturnValue(okResponse());

        // Advance to trigger the next poll timer
        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        await flushMicrotasks();

        expect(result.current.error).toBeNull();
        expect(result.current.data).toEqual(snapshot);
    });

    it('aborts the in-flight request on unmount', async () => {
        let capturedSignal: AbortSignal | undefined;

        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation((_url: unknown, init?: RequestInit) => {
                capturedSignal = init?.signal as AbortSignal | undefined;

                // Never resolve — stays in-flight
                return new Promise(() => undefined);
            }),
        );

        const { unmount } = renderHook(() => useActiveBlock(5000));

        // Let the tick fire so fetch is called and the signal captured
        await flushMicrotasks();

        expect(capturedSignal).toBeDefined();
        expect(capturedSignal?.aborted).toBe(false);

        unmount();

        expect(capturedSignal?.aborted).toBe(true);
    });

    it('applies backoff after errors reach the threshold — next interval exceeds base', async () => {
        const BASE = 1000;
        const mockFetch = vi.fn().mockReturnValue(errorResponse(500));
        vi.stubGlobal('fetch', mockFetch);

        const { result } = renderHook(() => useActiveBlock(BASE));

        // Drive enough error ticks to exceed the backoff threshold
        for (let i = 0; i <= ACTIVE_BLOCK_BACKOFF_THRESHOLD; i++) {
            await flushMicrotasks();
            await act(async () => {
                vi.advanceTimersByTime(BASE);
            });
        }
        await flushMicrotasks();

        expect(result.current.error).not.toBeNull();
        const callsAfterBackoff = mockFetch.mock.calls.length;

        // Swap to success response; advance only BASE ms (shorter than the doubled interval)
        mockFetch.mockReturnValue(okResponse());
        await act(async () => {
            vi.advanceTimersByTime(BASE);
        });
        await flushMicrotasks();

        // The doubled timer has NOT elapsed — no new fetch should have fired
        expect(mockFetch.mock.calls.length).toBe(callsAfterBackoff);
        // Data is still null because the success response hasn't been fetched yet
        expect(result.current.data).toBeNull();
    });

    it('resets to base interval after a success following backoff', async () => {
        const BASE = 1000;
        const mockFetch = vi.fn().mockReturnValue(errorResponse(500));
        vi.stubGlobal('fetch', mockFetch);

        const { result } = renderHook(() => useActiveBlock(BASE));

        // Drive past backoff threshold (THRESHOLD=3; loop 0..3 = 4 error ticks).
        // After 4 errors the scheduled interval is 4×BASE (see backoff doubling math).
        for (let i = 0; i <= ACTIVE_BLOCK_BACKOFF_THRESHOLD; i++) {
            await flushMicrotasks();
            await act(async () => {
                vi.advanceTimersByTime(BASE);
            });
        }
        await flushMicrotasks();
        expect(result.current.error).not.toBeNull();

        // After 4 errors the interval is 4×BASE. Advance that far to trigger the poll.
        mockFetch.mockReturnValue(okResponse());
        await act(async () => {
            vi.advanceTimersByTime(BASE * 4);
        });
        await flushMicrotasks();

        expect(result.current.data).toEqual(snapshot);
        expect(result.current.error).toBeNull();
    });

    it('does not update state after unmount', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(snapshot),
                } as unknown as Response),
            ),
        );

        const { unmount } = renderHook(() => useActiveBlock(5000));

        // Unmount before the promise resolves by not flushing microtasks first
        unmount();

        // Now flush — the response arrives after unmount
        await flushMicrotasks();

        const errorCalls = consoleSpy.mock.calls.map((args) => String(args[0]));
        expect(errorCalls.some((msg) => msg.includes('unmounted'))).toBe(false);

        consoleSpy.mockRestore();
    });
});
