'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type ApiResult = {
    assetId: string;
    created: boolean;
    status: string;
    metadataStatus: string;
    error?: string;
};

export function PublicUrlAssetForm() {
    const router = useRouter();
    const [url, setUrl] = useState('');
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPending(true);
        setMessage(null);

        try {
            const csrf = await fetch('/api/csrf', { cache: 'no-store' }).then(
                async (response) => (await response.json()) as { csrfToken: string },
            );
            const response = await fetch('/api/assets/from-url', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': csrf.csrfToken,
                },
                body: JSON.stringify({ url }),
            });
            const result = (await response.json()) as ApiResult;

            if (!response.ok) {
                throw new Error(result.error || `Request failed: ${response.status}`);
            }
            setUrl('');
            setMessage(
                result.status === 'ready'
                    ? result.created
                        ? 'Public video added and verified.'
                        : 'Existing asset refreshed.'
                    : 'Saved for review. Metadata error is visible in Library.',
            );
            router.refresh();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not add public video');
        } finally {
            setPending(false);
        }
    }

    return (
        <form onSubmit={submit} className="surface-panel p-4">
            <h2 className="text-base font-semibold">Add public video</h2>
            <p className="mt-1 text-sm text-muted">
                Paste a public page, direct file, HLS, or embed URL. No provider account required.
            </p>
            <div className="mt-4 flex gap-2">
                <input
                    type="url"
                    required
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://provider.example/video"
                    className="min-w-0 flex-1 border border-line px-3 py-2 text-sm"
                />
                <button type="submit" disabled={pending} className="btn-primary">
                    {pending ? 'Checking…' : 'Add video'}
                </button>
            </div>
            {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
        </form>
    );
}

export function RefreshAssetButton({ assetId }: { assetId: string }) {
    const router = useRouter();
    const [pending, setPending] = useState(false);

    async function refresh() {
        setPending(true);

        try {
            const csrf = await fetch('/api/csrf', { cache: 'no-store' }).then(
                async (response) => (await response.json()) as { csrfToken: string },
            );
            await fetch(`/api/media/assets/${assetId}/refresh`, {
                method: 'POST',
                headers: { 'x-csrf-token': csrf.csrfToken },
            });
            router.refresh();
        } finally {
            setPending(false);
        }
    }

    return (
        <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="btn-secondary text-xs"
        >
            {pending ? 'Refreshing…' : 'Refresh metadata'}
        </button>
    );
}
