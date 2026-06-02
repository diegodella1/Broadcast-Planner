'use client';

import { useEffect, useRef, useState } from 'react';

import type { BlockCategory, ProgramStatus } from '@/lib/types';

import { nextPollState } from './use-active-block-backoff';

export type ActiveBlockSnapshot = {
    active: {
        blockId: string;
        blockTitle: string;
        blockCategory: BlockCategory;
        startsAt: number;
        durationSeconds: number;
        elapsedInBlock: number;
        live?: {
            sourceType: string;
            status: string;
            url: string;
        };
    } | null;
    dayStatus: ProgramStatus;
};

export type UseActiveBlockResult = {
    data: ActiveBlockSnapshot | null;
    error: string | null;
    isLoading: boolean;
};

const ENDPOINT = '/api/active-block';

export function useActiveBlock(intervalMs = 5000): UseActiveBlockResult {
    const [data, setData] = useState<ActiveBlockSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const baseIntervalMsRef = useRef(intervalMs);

    useEffect(() => {
        baseIntervalMsRef.current = intervalMs;
    }, [intervalMs]);

    useEffect(() => {
        let unmounted = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let inflight: AbortController | null = null;
        let pollState = { intervalMs: baseIntervalMsRef.current, consecutiveErrors: 0 };

        const schedule = () => {
            if (unmounted) {
                return;
            }
            timer = setTimeout(tick, pollState.intervalMs);
        };

        const tick = async () => {
            if (unmounted) {
                return;
            }

            if (inflight) {
                inflight.abort();
            }
            const controller = new AbortController();
            inflight = controller;

            try {
                const response = await fetch(ENDPOINT, {
                    signal: controller.signal,
                    cache: 'no-store',
                });

                if (!response.ok) {
                    throw new Error(`Active block request failed (${response.status})`);
                }
                const payload = (await response.json()) as ActiveBlockSnapshot;

                if (unmounted || controller.signal.aborted) {
                    return;
                }
                setData(payload);
                setError(null);
                pollState = nextPollState(pollState, 'success', baseIntervalMsRef.current);
            } catch (err) {
                if (controller.signal.aborted || unmounted) {
                    return;
                }
                const message = err instanceof Error ? err.message : 'Unknown error';
                setError(message);
                pollState = nextPollState(pollState, 'error', baseIntervalMsRef.current);
            } finally {
                if (inflight === controller) {
                    inflight = null;
                }

                if (!unmounted) {
                    setIsLoading(false);
                    schedule();
                }
            }
        };

        void tick();

        return () => {
            unmounted = true;

            if (timer !== null) {
                clearTimeout(timer);
            }

            if (inflight) {
                inflight.abort();
            }
        };
    }, [intervalMs]);

    return { data, error, isLoading };
}
