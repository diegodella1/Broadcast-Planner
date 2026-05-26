'use client';

import { useEffect, useMemo, useState } from 'react';

import { getScheduleLiveState } from '@/lib/schedule-live-state';
import type { ProgramBlock } from '@/lib/types';

export function useScheduleLiveState(date: string, timezone: string, blocks: ProgramBlock[]) {
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        const timeout = window.setTimeout(() => setNow(new Date()), 0);
        const interval = window.setInterval(() => setNow(new Date()), 1000);

        return () => {
            window.clearTimeout(timeout);
            window.clearInterval(interval);
        };
    }, []);

    return useMemo(
        () =>
            now
                ? getScheduleLiveState({ date, timezone, blocks, now })
                : {
                      isToday: false,
                      nowSeconds: null,
                      activeBlock: null,
                      elapsedSeconds: 0,
                      nextBlock: null,
                  },
        [blocks, date, now, timezone],
    );
}
