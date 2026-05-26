import { formatTimecode } from '@/lib/helpers/time';

import type { ActiveSchedule } from '@/lib/types';

export function OutputStub({
    active,
    secondsOfDay,
    debug = false,
    label = 'Output monitor',
}: {
    active: ActiveSchedule;
    secondsOfDay: number;
    debug?: boolean;
    label?: string;
}) {
    const outputState = active.block ? 'stub' : 'idle';
    const asset = active.asset ?? active.slide ?? null;
    const sourceLabel = active.asset?.sourceType ?? active.slide?.slideType ?? 'none';

    return (
        <main
            className="tv-output grid place-items-center bg-zinc-950 text-white"
            data-testid="output-root"
            data-output-state={outputState}
            data-media-state="disabled"
            data-active-asset-id={active.asset?.id ?? ''}
            data-fallback-asset-id={active.fallbackAsset?.id ?? ''}
        >
            <section className="w-full max-w-5xl px-10 py-12">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-emerald-300">
                    {label}
                </p>
                <h1 className="mt-4 text-5xl font-semibold tracking-normal">
                    Legacy output status
                </h1>
                <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-300">
                    Use Live Browser Output from Admin Output for OBS or vMix capture. This legacy
                    surface stays online for status checks and compatibility only.
                </p>
                <dl className="mt-8 grid gap-3 rounded border border-white/10 bg-white/[0.04] p-5 text-sm md:grid-cols-2">
                    <Metric label="Clock" value={formatTimecode(secondsOfDay)} />
                    <Metric label="Block" value={active.block?.title ?? active.reason ?? 'none'} />
                    <Metric label="Elapsed" value={formatTimecode(active.elapsedInBlock)} />
                    <Metric label="Asset" value={asset?.title ?? 'none'} />
                    <Metric label="Source" value={sourceLabel} />
                    <Metric label="Fallback" value={active.fallbackAsset?.title ?? 'none'} />
                </dl>
                {debug ? (
                    <pre className="mt-6 whitespace-pre-wrap rounded border border-white/10 bg-black/40 p-4 text-xs text-zinc-300">
                        {[
                            `outputState: ${outputState}`,
                            'mediaState: disabled',
                            `mediaAssetId: ${active.asset?.id ?? 'none'}`,
                            `fallback: ${active.fallbackAsset?.title ?? 'none'}`,
                            'playback: browser output primary',
                        ].join('\n')}
                    </pre>
                ) : null}
            </section>
        </main>
    );
}

export function EmergencyOutputStub({ reason }: { reason: string }) {
    return (
        <main
            className="tv-output grid place-items-center bg-zinc-950 text-white"
            data-testid="output-root"
            data-output-state="emergency"
            data-media-state="disabled"
            data-active-asset-id=""
            data-fallback-asset-id=""
        >
            <section className="px-10 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-red-300">
                    Output error
                </p>
                <h1 className="mt-4 text-5xl font-semibold">Output unavailable</h1>
                <p className="mt-4 text-lg text-zinc-300">{reason}</p>
            </section>
        </main>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
            <dd className="mt-1 truncate font-mono text-zinc-100">{value}</dd>
        </div>
    );
}
