'use client';

import { useState, type FormEvent, type ReactNode } from 'react';

import { CSRF_FIELD } from '@/lib/csrf-constants';

export function CsrfRefreshingForm({
    action,
    method = 'post',
    encType,
    className,
    children,
}: {
    action: string;
    method?: string;
    encType?: string;
    className?: string;
    children: ReactNode;
}) {
    const [error, setError] = useState('');

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        setError('');

        const fileError = firstFileLimitError(form);

        if (fileError) {
            setError(fileError);

            return;
        }

        try {
            const token = await fetchFreshCsrfToken();
            const input = form.elements.namedItem(CSRF_FIELD);

            if (input instanceof HTMLInputElement) {
                input.value = token;
            }
            form.submit();
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Could not submit the form');
        }
    }

    return (
        <form
            action={action}
            method={method}
            encType={encType}
            className={className}
            onSubmit={onSubmit}
        >
            {error ? (
                <div className="mb-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-strong">
                    {error}
                </div>
            ) : null}
            {children}
        </form>
    );
}

function firstFileLimitError(form: HTMLFormElement) {
    const inputs = Array.from(form.elements).filter(
        (element): element is HTMLInputElement =>
            element instanceof HTMLInputElement && element.type === 'file',
    );

    for (const input of inputs) {
        const maxBytes = Number(input.dataset.maxFileBytes);

        if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
            continue;
        }
        const file = input.files?.[0];

        if (file && file.size > maxBytes) {
            return `File is ${formatBytes(file.size)}. Browser uploads must be ${formatBytes(maxBytes)} or less; use Vimeo or a remote URL for larger videos.`;
        }
    }

    return '';
}

async function fetchFreshCsrfToken() {
    const response = await fetch('/api/csrf', {
        credentials: 'same-origin',
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error('Could not refresh CSRF token');
    }
    const data = (await response.json()) as { csrfToken?: string };

    if (!data.csrfToken) {
        throw new Error('Missing CSRF token');
    }

    return data.csrfToken;
}

function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }

    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
