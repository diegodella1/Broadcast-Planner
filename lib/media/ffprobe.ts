import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type ProbeStream = {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    bit_rate?: string;
};

type ProbePayload = {
    format?: {
        duration?: string;
        size?: string;
        bit_rate?: string;
        format_name?: string;
    };
    streams?: ProbeStream[];
};

export type MediaProbe = {
    durationSeconds: number | null;
    fileSizeBytes: number | null;
    width: number | null;
    height: number | null;
    videoCodec: string | null;
    audioCodec: string | null;
    bitRate: number | null;
    frameRate: number | null;
    qualityLabel: string | null;
    formatName: string | null;
};

export async function probeMediaInput(input: string): Promise<MediaProbe> {
    const remoteOptions = /^https?:\/\//i.test(input)
        ? ['-protocol_whitelist', 'file,http,https,tcp,tls', '-follow_redirects', '0']
        : [];
    const { stdout } = await execFileAsync(
        'ffprobe',
        [
            '-v',
            'error',
            '-rw_timeout',
            '15000000',
            '-probesize',
            '10000000',
            '-analyzeduration',
            '15000000',
            ...remoteOptions,
            '-show_entries',
            'format=duration,size,bit_rate,format_name:stream=codec_type,codec_name,width,height,avg_frame_rate,bit_rate',
            '-of',
            'json',
            input,
        ],
        { timeout: 20_000, maxBuffer: 1024 * 1024 },
    );
    const payload = JSON.parse(stdout) as ProbePayload;
    const video = payload.streams?.find((stream) => stream.codec_type === 'video');
    const audio = payload.streams?.find((stream) => stream.codec_type === 'audio');
    const width = positiveInteger(video?.width);
    const height = positiveInteger(video?.height);

    return {
        durationSeconds: positiveRounded(payload.format?.duration),
        fileSizeBytes: positiveInteger(payload.format?.size),
        width,
        height,
        videoCodec: video?.codec_name ?? null,
        audioCodec: audio?.codec_name ?? null,
        bitRate: positiveInteger(video?.bit_rate ?? payload.format?.bit_rate),
        frameRate: frameRate(video?.avg_frame_rate),
        qualityLabel: qualityLabel(width, height),
        formatName: payload.format?.format_name ?? null,
    };
}

export function qualityLabel(width: number | null, height: number | null) {
    const longEdge = Math.max(width ?? 0, height ?? 0);
    const shortEdge = Math.min(width ?? 0, height ?? 0);

    if (longEdge >= 3840 || shortEdge >= 2160) {
        return 'UHD';
    }

    if (longEdge >= 2560 || shortEdge >= 1440) {
        return 'QHD';
    }

    if (longEdge >= 1920 || shortEdge >= 1080) {
        return 'FHD';
    }

    if (longEdge >= 1280 || shortEdge >= 720) {
        return 'HD';
    }

    if (longEdge || shortEdge) {
        return 'SD';
    }

    return null;
}

function positiveInteger(value: string | number | undefined) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function positiveRounded(value: string | number | undefined) {
    const number = Number(value);

    return Number.isFinite(number) && number > 0 ? Math.ceil(number) : null;
}

function frameRate(value?: string) {
    if (!value) {
        return null;
    }
    const [numerator, denominator = '1'] = value.split('/');
    const result = Number(numerator) / Number(denominator);

    return Number.isFinite(result) && result > 0 ? Number(result.toFixed(3)) : null;
}
