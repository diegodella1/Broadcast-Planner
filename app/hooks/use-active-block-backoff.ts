export const ACTIVE_BLOCK_MAX_INTERVAL_MS = 60_000;
export const ACTIVE_BLOCK_BACKOFF_THRESHOLD = 3;

/**
 * Compute the next polling interval for `useActiveBlock`.
 *
 * - On success: reset to `baseIntervalMs` and clear failure count.
 * - On error: increment failure count. While failures are below the threshold,
 *   keep `baseIntervalMs`. Once the threshold is reached, double the interval
 *   each subsequent failure, capped at `ACTIVE_BLOCK_MAX_INTERVAL_MS`.
 *
 * Pure function so it can be unit-tested in a node environment without DOM.
 */
export function nextPollState(
    current: { intervalMs: number; consecutiveErrors: number },
    outcome: 'success' | 'error',
    baseIntervalMs: number,
): { intervalMs: number; consecutiveErrors: number } {
    if (outcome === 'success') {
        return { intervalMs: baseIntervalMs, consecutiveErrors: 0 };
    }

    const consecutiveErrors = current.consecutiveErrors + 1;

    if (consecutiveErrors < ACTIVE_BLOCK_BACKOFF_THRESHOLD) {
        return { intervalMs: baseIntervalMs, consecutiveErrors };
    }

    const doubled =
        current.intervalMs >= baseIntervalMs ? current.intervalMs * 2 : baseIntervalMs * 2;
    const intervalMs = Math.min(doubled, ACTIVE_BLOCK_MAX_INTERVAL_MS);

    return { intervalMs, consecutiveErrors };
}
