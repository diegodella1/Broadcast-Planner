export type ReutersStreamConfig = {
    protocol: 'hls' | 'rtmp';
    url: string;
    label: string;
    expiresAt?: string | null;
};

export function parseReutersStreamInput(input: {
    url?: string | null;
    label?: string | null;
    expiresAt?: string | null;
}): ReutersStreamConfig | null {
    const url = String(input.url ?? '').trim();

    if (!url) {
        return null;
    }
    const protocol = protocolForReutersUrl(url);

    if (!protocol) {
        throw new Error('Reuters stream must be an HLS (.m3u8) or RTMP URL');
    }

    return {
        protocol,
        url,
        label: String(input.label ?? '').trim() || 'Reuters live',
        expiresAt: normalizeExpiry(input.expiresAt),
    };
}

export function protocolForReutersUrl(url: string): 'hls' | 'rtmp' | null {
    if (/^rtmps?:\/\//i.test(url)) {
        return 'rtmp';
    }

    if (/^https?:\/\/.+\.m3u8(?:[?#].*)?$/i.test(url)) {
        return 'hls';
    }

    return null;
}

export function maskStreamUrl(url: string) {
    try {
        const parsed = new URL(url);
        parsed.search = parsed.search ? '?...' : '';

        return parsed.toString();
    } catch {
        return url.replace(/([?&]).+$/, '$1...');
    }
}

function normalizeExpiry(value?: string | null) {
    const raw = String(value ?? '').trim();

    if (!raw) {
        return null;
    }
    const timestamp = Date.parse(raw);

    if (!Number.isFinite(timestamp)) {
        throw new Error('Reuters stream expiry is invalid');
    }

    return new Date(timestamp).toISOString();
}
