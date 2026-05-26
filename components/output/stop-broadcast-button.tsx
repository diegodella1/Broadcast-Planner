'use client';

import { useTransition } from 'react';

interface StopBroadcastButtonProps {
    action: () => Promise<void>;
    disabled?: boolean;
    label: string;
    confirmMessage: string;
}

export function StopBroadcastButton({
    action,
    disabled = false,
    label,
    confirmMessage,
}: StopBroadcastButtonProps) {
    const [isPending, startTransition] = useTransition();

    function handleClick() {
        if (!confirm(confirmMessage)) {
            return;
        }
        startTransition(async () => {
            await action();
        });
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={disabled || isPending}
            className="w-full rounded-md bg-accent-live px-3 py-2 text-xs font-semibold text-accent-live-text transition-colors hover:bg-accent-live/80 disabled:cursor-not-allowed disabled:opacity-40"
        >
            {isPending ? '...' : label}
        </button>
    );
}
