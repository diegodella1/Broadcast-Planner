import { formatTimecode } from '@/lib/helpers/time';

export function Timecode({ seconds }: { seconds: number }) {
    return <span className="font-mono tabular-nums">{formatTimecode(seconds)}</span>;
}
