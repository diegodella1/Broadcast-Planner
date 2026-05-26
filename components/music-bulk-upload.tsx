'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { CSRF_FIELD } from '@/lib/csrf-constants';
import { MAX_SMALL_MEDIA_BYTES, formatUploadLimit } from '@/lib/media-upload-constants';
import { sanitizeMusicMetadata, type MusicMetadata } from '@/lib/music-metadata';

type TrackRow = {
    id: string;
    file: File;
    title: string;
    artist: string;
    album: string;
    year: string;
    track: string;
    genre: string;
    durationSeconds: string;
    status: 'reading' | 'ready' | 'needs_duration' | 'uploading' | 'uploaded' | 'failed';
    message: string;
};

type UploadResponse = {
    ok?: boolean;
    assetId?: string;
    error?: string;
};

export function MusicBulkUpload() {
    const router = useRouter();
    const [rows, setRows] = useState<TrackRow[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedCount, setUploadedCount] = useState(0);
    const aliveRef = useRef(true);

    useEffect(() => {
        return () => {
            aliveRef.current = false;
        };
    }, []);

    const readyToUpload =
        rows.length > 0 &&
        !isUploading &&
        rows.every((row) => row.status === 'ready' || row.status === 'uploaded');
    const pendingRows = rows.filter((row) => row.status !== 'uploaded');

    async function onFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';

        if (!files.length) {
            return;
        }

        const initialRows = files.map((file) => initialTrackRow(file));
        setRows((current) => [...current, ...initialRows]);

        for (const row of initialRows) {
            const resolved = await readTrackRow(row);

            if (!aliveRef.current) {
                return;
            }
            setRows((current) => current.map((item) => (item.id === row.id ? resolved : item)));
        }
    }

    function updateRow(id: string, patch: Partial<TrackRow>) {
        setRows((current) =>
            current.map((row) => {
                if (row.id !== id) {
                    return row;
                }
                const next = { ...row, ...patch };

                if (patch.durationSeconds !== undefined && next.status === 'needs_duration') {
                    next.status = validDuration(patch.durationSeconds) ? 'ready' : 'needs_duration';
                    next.message = next.status === 'ready' ? 'Ready' : 'Enter duration seconds';
                }

                return next;
            }),
        );
    }

    function removeRow(id: string) {
        setRows((current) => current.filter((row) => row.id !== id));
    }

    async function uploadRows() {
        setIsUploading(true);
        setUploadedCount(rows.filter((row) => row.status === 'uploaded').length);

        try {
            const csrfToken = await fetchFreshCsrfToken();

            for (const row of pendingRows) {
                setRows((current) =>
                    current.map((item) =>
                        item.id === row.id
                            ? { ...item, status: 'uploading', message: 'Uploading...' }
                            : item,
                    ),
                );

                try {
                    await uploadOne(row, csrfToken);
                    setUploadedCount((count) => count + 1);
                    setRows((current) =>
                        current.map((item) =>
                            item.id === row.id
                                ? { ...item, status: 'uploaded', message: 'Uploaded' }
                                : item,
                        ),
                    );
                } catch (error) {
                    setRows((current) =>
                        current.map((item) =>
                            item.id === row.id
                                ? {
                                      ...item,
                                      status: 'failed',
                                      message:
                                          error instanceof Error ? error.message : 'Upload failed',
                                  }
                                : item,
                        ),
                    );
                }
            }
            router.refresh();
        } finally {
            setIsUploading(false);
        }
    }

    return (
        <section className="surface-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-base font-semibold">Bulk upload music tracks</h2>
                    <p className="mt-1 text-sm text-muted">
                        Select MP3 files, review detected metadata, then upload them into the
                        background playlist.
                    </p>
                </div>
                <label className="btn-secondary cursor-pointer">
                    Select MP3 files
                    <input
                        type="file"
                        multiple
                        accept="audio/mpeg,audio/mp3"
                        className="sr-only"
                        onChange={onFilesSelected}
                    />
                </label>
            </div>

            {rows.length ? (
                <div className="mt-4 overflow-hidden rounded-md border border-line">
                    <div className="grid grid-cols-[minmax(180px,1.1fr)_minmax(140px,0.8fr)_minmax(120px,0.7fr)_90px_110px_90px] gap-2 border-b border-line bg-panel-soft px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-muted">
                        <span>Track</span>
                        <span>Artist</span>
                        <span>Album</span>
                        <span>Seconds</span>
                        <span>Status</span>
                        <span />
                    </div>
                    <div className="divide-y divide-line">
                        {rows.map((row) => (
                            <div
                                key={row.id}
                                className="grid grid-cols-[minmax(180px,1.1fr)_minmax(140px,0.8fr)_minmax(120px,0.7fr)_90px_110px_90px] gap-2 px-3 py-3 text-sm"
                            >
                                <label className="grid gap-1">
                                    <input
                                        value={row.title}
                                        onChange={(event) =>
                                            updateRow(row.id, { title: event.target.value })
                                        }
                                        className="border border-line px-2 py-1.5"
                                    />
                                    <span className="truncate text-xs text-muted">
                                        {row.file.name} · {formatBytes(row.file.size)}
                                    </span>
                                </label>
                                <input
                                    value={row.artist}
                                    placeholder="Artist"
                                    onChange={(event) =>
                                        updateRow(row.id, { artist: event.target.value })
                                    }
                                    className="border border-line px-2 py-1.5"
                                />
                                <input
                                    value={row.album}
                                    placeholder="Album"
                                    onChange={(event) =>
                                        updateRow(row.id, { album: event.target.value })
                                    }
                                    className="border border-line px-2 py-1.5"
                                />
                                <input
                                    value={row.durationSeconds}
                                    type="number"
                                    min="1"
                                    placeholder="Sec"
                                    onChange={(event) =>
                                        updateRow(row.id, { durationSeconds: event.target.value })
                                    }
                                    className="border border-line px-2 py-1.5"
                                />
                                <span className={statusClass(row.status)}>{row.message}</span>
                                <button
                                    type="button"
                                    className="rounded-md border border-line px-2 py-1.5 text-xs font-semibold"
                                    disabled={isUploading}
                                    onClick={() => removeRow(row.id)}
                                >
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="mt-4 rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                    No tracks selected. MP3 uploads are capped at {formatUploadLimit()} each.
                </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">
                    {rows.length
                        ? `${uploadedCount} / ${rows.length} uploaded`
                        : 'Detected title, artist and album are editable before upload.'}
                </p>
                <button className="btn-primary" disabled={!readyToUpload} onClick={uploadRows}>
                    {isUploading ? 'Uploading...' : 'Upload selected tracks'}
                </button>
            </div>
        </section>
    );
}

function initialTrackRow(file: File): TrackRow {
    return {
        id: crypto.randomUUID(),
        file,
        title: cleanTitle(file.name),
        artist: '',
        album: '',
        year: '',
        track: '',
        genre: '',
        durationSeconds: '',
        status: 'reading',
        message:
            file.size > MAX_SMALL_MEDIA_BYTES
                ? `File exceeds ${formatUploadLimit()}`
                : file.type && !file.type.startsWith('audio/')
                  ? 'Unsupported audio file'
                  : 'Reading metadata...',
    };
}

async function readTrackRow(row: TrackRow): Promise<TrackRow> {
    if (
        row.file.size > MAX_SMALL_MEDIA_BYTES ||
        (row.file.type && !row.file.type.startsWith('audio/'))
    ) {
        return { ...row, status: 'failed' };
    }
    const [durationSeconds, tags] = await Promise.all([
        readAudioDuration(row.file),
        readId3Tags(row.file),
    ]);
    const music = sanitizeMusicMetadata(tags);
    const duration = durationSeconds ? String(durationSeconds) : '';

    return {
        ...row,
        title: music.music_title || row.title,
        artist: music.artist || '',
        album: music.album || '',
        year: music.year || '',
        track: music.track || '',
        genre: music.genre || '',
        durationSeconds: duration,
        status: duration ? 'ready' : 'needs_duration',
        message: duration ? 'Ready' : 'Enter duration seconds',
    };
}

function readAudioDuration(file: File) {
    return new Promise<number | null>((resolve) => {
        const url = URL.createObjectURL(file);
        const audio = document.createElement('audio');
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
            const duration = Math.ceil(audio.duration || 0);
            URL.revokeObjectURL(url);
            resolve(duration > 0 ? duration : null);
        };
        audio.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        audio.src = url;
    });
}

async function readId3Tags(file: File): Promise<MusicMetadata> {
    const bytes = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer());

    if (bytes.length < 10 || text(bytes, 0, 3) !== 'ID3') {
        return {};
    }
    const version = bytes[3];
    const tagSize = synchsafe(bytes, 6);
    const limit = Math.min(bytes.length, 10 + tagSize);
    let offset = 10;
    const tags: MusicMetadata = {};

    while (offset + 10 <= limit) {
        const id = text(bytes, offset, 4);

        if (!/^[A-Z0-9]{4}$/.test(id)) {
            break;
        }
        const size = version === 4 ? synchsafe(bytes, offset + 4) : uint32(bytes, offset + 4);

        if (size <= 0 || offset + 10 + size > limit) {
            break;
        }
        const value = decodeTextFrame(bytes.slice(offset + 10, offset + 10 + size));

        if (id === 'TIT2') {
            tags.music_title = value;
        }

        if (id === 'TPE1') {
            tags.artist = value;
        }

        if (id === 'TALB') {
            tags.album = value;
        }

        if (id === 'TYER' || id === 'TDRC') {
            tags.year = value;
        }

        if (id === 'TRCK') {
            tags.track = value;
        }

        if (id === 'TCON') {
            tags.genre = value;
        }
        offset += 10 + size;
    }

    return tags;
}

function decodeTextFrame(bytes: Uint8Array) {
    if (!bytes.length) {
        return '';
    }
    const encoding = bytes[0];
    const body = bytes.slice(1);
    const decoder =
        encoding === 1 || encoding === 2
            ? new TextDecoder('utf-16', { fatal: false })
            : encoding === 3
              ? new TextDecoder('utf-8', { fatal: false })
              : new TextDecoder('latin1', { fatal: false });

    return decoder.decode(body).replace(/\0/g, '').trim();
}

async function uploadOne(row: TrackRow, csrfToken: string) {
    const form = new FormData();
    form.set(CSRF_FIELD, csrfToken);
    form.set('asset_type', 'music');
    form.set('orientation', 'auto');
    form.set('title', row.title.trim() || cleanTitle(row.file.name));
    form.set('duration_seconds', row.durationSeconds);
    form.set('detected_duration_seconds', row.durationSeconds);
    form.set(
        'metadata_json',
        JSON.stringify({
            music_title: row.title,
            artist: row.artist,
            album: row.album,
            year: row.year,
            track: row.track,
            genre: row.genre,
        }),
    );
    form.set('media_file', row.file);
    const response = await fetch('/api/assets/upload', {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
    });
    const data = (await response.json().catch(() => ({}))) as UploadResponse;

    if (!response.ok || data.ok === false) {
        throw new Error(data.error || `Upload failed (${response.status})`);
    }
}

async function fetchFreshCsrfToken() {
    const response = await fetch('/api/csrf', {
        credentials: 'same-origin',
        cache: 'no-store',
    });
    const data = (await response.json()) as { csrfToken?: string };

    if (!response.ok || !data.csrfToken) {
        throw new Error('Could not refresh CSRF token');
    }

    return data.csrfToken;
}

function cleanTitle(fileName: string) {
    return fileName
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function validDuration(value: string) {
    const duration = Number(value);

    return Number.isFinite(duration) && duration > 0;
}

function statusClass(status: TrackRow['status']) {
    const base = 'self-center rounded-md px-2 py-1 text-xs font-semibold';

    if (status === 'ready' || status === 'uploaded') {
        return `${base} bg-success-soft text-success-strong`;
    }

    if (status === 'failed' || status === 'needs_duration') {
        return `${base} bg-danger-soft text-danger-strong`;
    }

    return `${base} bg-panel-soft text-muted`;
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

function text(bytes: Uint8Array, offset: number, length: number) {
    return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function synchsafe(bytes: Uint8Array, offset: number) {
    return (
        ((bytes[offset] ?? 0) << 21) |
        ((bytes[offset + 1] ?? 0) << 14) |
        ((bytes[offset + 2] ?? 0) << 7) |
        (bytes[offset + 3] ?? 0)
    );
}

function uint32(bytes: Uint8Array, offset: number) {
    return (
        ((bytes[offset] ?? 0) << 24) |
        ((bytes[offset + 1] ?? 0) << 16) |
        ((bytes[offset + 2] ?? 0) << 8) |
        (bytes[offset + 3] ?? 0)
    );
}
