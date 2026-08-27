import { isIP } from 'node:net';
import { resolve4, resolve6 } from 'node:dns/promises';

import { probeMediaInput, qualityLabel } from './ffprobe';

const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export type PublicMediaMetadata = {
    canonicalUrl: string;
    playbackUrl: string;
    playbackKind: 'video_file' | 'hls' | 'embed' | 'image' | 'audio';
    mediaKind: 'video' | 'image' | 'audio';
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    contentType: string | null;
    fileSizeBytes: number | null;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
    videoCodec: string | null;
    audioCodec: string | null;
    bitRate: number | null;
    frameRate: number | null;
    qualityLabel: string | null;
    etag: string | null;
    lastModified: string | null;
    metadataStatus: 'ready' | 'partial';
    metadata: Record<string, unknown>;
};

export async function inspectPublicMedia(rawUrl: string): Promise<PublicMediaMetadata> {
    const requestedUrl = canonicalizePublicUrl(rawUrl);
    const head = await fetchMetadataHeaders(requestedUrl);
    const contentType = normalizedContentType(head.response.headers.get('content-type'));
    const directKind = directPlaybackKind(contentType, head.url);

    if (directKind) {
        return inspectDirectMedia(head.url, head.response.headers, directKind);
    }

    const page = await safeFetch(head.url, {
        method: 'GET',
        headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    const html = await boundedText(page.response);
    const documentMetadata = parseDocumentMetadata(html, page.url);
    const oembed = documentMetadata.oembedUrl
        ? await readOembed(documentMetadata.oembedUrl).catch(() => null)
        : await readKnownPublicOembed(page.url).catch(() => null);
    const embedUrl =
        extractIframeSrc(oembed?.html) ??
        documentMetadata.videoUrl ??
        knownPublicEmbedUrl(page.url);

    if (!embedUrl) {
        throw new Error('The public page does not expose a playable video');
    }

    const safeEmbedUrl = canonicalizePublicUrl(embedUrl);
    await assertPublicUrl(new URL(safeEmbedUrl));
    const width = positiveInteger(oembed?.width ?? documentMetadata.width);
    const height = positiveInteger(oembed?.height ?? documentMetadata.height);

    return {
        canonicalUrl: page.url,
        playbackUrl: safeEmbedUrl,
        playbackKind: 'embed',
        mediaKind: 'video',
        title: stringValue(oembed?.title) || documentMetadata.title || titleFromUrl(page.url),
        description: documentMetadata.description,
        thumbnailUrl: stringValue(oembed?.thumbnail_url) || documentMetadata.imageUrl,
        contentType: normalizedContentType(page.response.headers.get('content-type')),
        fileSizeBytes: null,
        durationSeconds: positiveInteger(documentMetadata.duration),
        width,
        height,
        videoCodec: null,
        audioCodec: null,
        bitRate: null,
        frameRate: null,
        qualityLabel: qualityLabel(width, height),
        etag: page.response.headers.get('etag'),
        lastModified: page.response.headers.get('last-modified'),
        metadataStatus: documentMetadata.duration ? 'ready' : 'partial',
        metadata: {
            resolver: oembed ? 'oembed' : 'open_graph',
            provider_name: stringValue(oembed?.provider_name) || null,
            original_url: requestedUrl,
        },
    };
}

export function canonicalizePublicUrl(rawUrl: string) {
    const url = new URL(rawUrl.trim());

    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Only public HTTP(S) URLs are supported');
    }

    if (url.username || url.password) {
        throw new Error('URLs with embedded credentials are not supported');
    }
    url.hash = '';

    return url.toString();
}

async function inspectDirectMedia(
    url: string,
    headers: Headers,
    playbackKind: PublicMediaMetadata['playbackKind'],
): Promise<PublicMediaMetadata> {
    const contentType = normalizedContentType(headers.get('content-type'));
    const mediaKind =
        playbackKind === 'image' ? 'image' : playbackKind === 'audio' ? 'audio' : 'video';
    const probe = mediaKind === 'image' ? null : await probeMediaInput(url).catch(() => null);
    const headerSize = positiveInteger(headers.get('content-length'));

    return {
        canonicalUrl: url,
        playbackUrl: url,
        playbackKind,
        mediaKind,
        title: titleFromUrl(url),
        description: null,
        thumbnailUrl: mediaKind === 'image' ? url : null,
        contentType,
        fileSizeBytes: probe?.fileSizeBytes ?? headerSize,
        durationSeconds: probe?.durationSeconds ?? null,
        width: probe?.width ?? null,
        height: probe?.height ?? null,
        videoCodec: probe?.videoCodec ?? null,
        audioCodec: probe?.audioCodec ?? null,
        bitRate: probe?.bitRate ?? null,
        frameRate: probe?.frameRate ?? null,
        qualityLabel: probe?.qualityLabel ?? null,
        etag: headers.get('etag'),
        lastModified: headers.get('last-modified'),
        metadataStatus: probe || mediaKind === 'image' ? 'ready' : 'partial',
        metadata: { resolver: 'direct', format_name: probe?.formatName ?? null },
    };
}

async function fetchMetadataHeaders(url: string) {
    try {
        return await safeFetch(url, { method: 'HEAD' });
    } catch (error) {
        const message = error instanceof Error ? error.message : '';

        if (!message.includes('HTTP 405') && !message.includes('HTTP 501')) {
            throw error;
        }

        return safeFetch(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-0', Accept: '*/*' },
        });
    }
}

async function safeFetch(
    rawUrl: string,
    init: RequestInit,
): Promise<{ response: Response; url: string }> {
    let current = canonicalizePublicUrl(rawUrl);

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        const parsed = new URL(current);
        await assertPublicUrl(parsed);
        const response = await fetch(current, {
            ...init,
            redirect: 'manual',
            cache: 'no-store',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');

            if (!location || redirects === MAX_REDIRECTS) {
                throw new Error('Public URL redirected too many times');
            }
            current = canonicalizePublicUrl(new URL(location, current).toString());
            continue;
        }

        if (!response.ok) {
            throw new Error(`Public URL returned HTTP ${response.status}`);
        }

        return { response, url: canonicalizePublicUrl(response.url || current) };
    }

    throw new Error('Public URL could not be resolved');
}

async function assertPublicUrl(url: URL) {
    const hostname = url.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname.endsWith('.local')) {
        throw new Error('Private network URLs are not supported');
    }
    const addresses = isIP(hostname)
        ? [hostname]
        : [
              ...(await resolve4(hostname).catch(() => [])),
              ...(await resolve6(hostname).catch(() => [])),
          ];

    if (!addresses.length || addresses.some(isPrivateAddress)) {
        throw new Error('URL must resolve only to public addresses');
    }
}

export function isPrivateAddress(address: string) {
    if (address.includes(':')) {
        const normalized = address.toLowerCase();
        const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];

        if (mappedIpv4) {
            return isPrivateAddress(mappedIpv4);
        }

        return (
            normalized === '::' ||
            normalized === '::1' ||
            normalized.startsWith('fc') ||
            normalized.startsWith('fd') ||
            normalized.startsWith('fe8') ||
            normalized.startsWith('fe9') ||
            normalized.startsWith('fea') ||
            normalized.startsWith('feb') ||
            normalized.startsWith('ff')
        );
    }
    const [a, b] = address.split('.').map(Number);

    return (
        a === undefined ||
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && (b ?? 0) >= 16 && (b ?? 0) <= 31) ||
        (a === 192 && b === 168) ||
        a >= 224
    );
}

function directPlaybackKind(contentType: string | null, url: string) {
    const pathname = new URL(url).pathname.toLowerCase();

    if (contentType?.includes('mpegurl') || pathname.endsWith('.m3u8')) {
        return 'hls';
    }

    if (contentType?.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/.test(pathname)) {
        return 'video_file';
    }

    if (contentType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(pathname)) {
        return 'image';
    }

    if (contentType?.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg)$/.test(pathname)) {
        return 'audio';
    }

    return null;
}

function parseDocumentMetadata(html: string, baseUrl: string) {
    const metas = new Map<string, string>();

    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
        const key = attribute(tag, 'property') || attribute(tag, 'name');
        const content = attribute(tag, 'content');

        if (key && content) {
            metas.set(key.toLowerCase(), decodeHtml(content));
        }
    }
    const oembedTag = (html.match(/<link\b[^>]*type=["']application\/json\+oembed["'][^>]*>/i) ??
        html.match(
            /<link\b[^>]*href=["'][^"']+["'][^>]*type=["']application\/json\+oembed["'][^>]*>/i,
        ))?.[0];

    return {
        title: metas.get('og:title') ?? extractTitle(html),
        description: metas.get('og:description') ?? metas.get('description') ?? null,
        imageUrl: absoluteUrl(metas.get('og:image'), baseUrl),
        videoUrl: absoluteUrl(
            metas.get('og:video:secure_url') ??
                metas.get('og:video') ??
                metas.get('twitter:player'),
            baseUrl,
        ),
        width: metas.get('og:video:width'),
        height: metas.get('og:video:height'),
        duration: metas.get('video:duration') ?? metas.get('og:video:duration'),
        oembedUrl: absoluteUrl(oembedTag ? attribute(oembedTag, 'href') : null, baseUrl),
    };
}

async function readOembed(url: string) {
    const result = await safeFetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    const body = await boundedText(result.response);

    return JSON.parse(body) as Record<string, unknown>;
}

async function readKnownPublicOembed(url: string) {
    const parsed = new URL(url);
    const youtubeId = youtubeVideoId(parsed);

    if (!youtubeId) {
        return null;
    }

    return readOembed(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
}

function knownPublicEmbedUrl(rawUrl: string) {
    const url = new URL(rawUrl);
    const youtubeId = youtubeVideoId(url);

    return youtubeId ? `https://www.youtube-nocookie.com/embed/${youtubeId}` : null;
}

function youtubeVideoId(url: URL) {
    if (url.hostname === 'youtu.be') {
        return url.pathname.split('/').filter(Boolean)[0] ?? null;
    }

    if (url.hostname.endsWith('youtube.com')) {
        if (url.pathname === '/watch') {
            return url.searchParams.get('v');
        }
        const parts = url.pathname.split('/').filter(Boolean);

        if (['embed', 'shorts', 'live'].includes(parts[0] ?? '')) {
            return parts[1] ?? null;
        }
    }

    return null;
}

async function boundedText(response: Response) {
    const declared = positiveInteger(response.headers.get('content-length'));

    if (declared && declared > MAX_HTML_BYTES) {
        throw new Error('Metadata response is too large');
    }
    const text = await response.text();

    if (Buffer.byteLength(text) > MAX_HTML_BYTES) {
        throw new Error('Metadata response is too large');
    }

    return text;
}

function attribute(tag: string, name: string) {
    const match = tag.match(new RegExp(`${name}\\\\s*=\\\\s*[\"']([^\"']*)[\"']`, 'i'));

    return match?.[1] ?? null;
}

function extractIframeSrc(value: unknown) {
    return typeof value === 'string'
        ? (value.match(/<iframe\b[^>]*src=["']([^"']+)["']/i)?.[1] ?? null)
        : null;
}

function extractTitle(html: string) {
    const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];

    return title ? decodeHtml(title.trim()) : null;
}

function absoluteUrl(value: string | null | undefined, baseUrl: string) {
    if (!value) {
        return null;
    }

    try {
        return new URL(value, baseUrl).toString();
    } catch {
        return null;
    }
}

function decodeHtml(value: string) {
    return value
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');
}

function titleFromUrl(rawUrl: string) {
    const url = new URL(rawUrl);
    const filename = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');

    return filename.replace(/\.[a-z0-9]{2,5}$/i, '') || url.hostname;
}

function normalizedContentType(value: string | null) {
    return value?.split(';')[0]?.trim().toLowerCase() || null;
}

function positiveInteger(value: unknown) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function stringValue(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}
