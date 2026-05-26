'use client';

import type { ReactNode } from 'react';

export function ConfirmSubmitButton({
    message,
    children,
    className,
}: {
    message: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <button
            className={className}
            onClick={(event) => {
                if (!window.confirm(message)) {
                    event.preventDefault();
                }
            }}
        >
            {children}
        </button>
    );
}
