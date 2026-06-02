'use client';

/* eslint-disable jsx-a11y/media-has-caption */

import type Hls from 'hls.js';
import { useEffect, useMemo, useRef, useState } from 'react';

type MediaState =
    | 'idle'
    | 'syncing'
    | 'ready'
    | 'playing'
    | 'waiting'
    | 'stalled'
    | 'errored'
    | 'fallback';

type BackgroundMusic = {
    enabled: boolean;
    volume: number;
    fade: 'none' | 'short';
    tracks: Array<{ id: string; title: string; url: string }>;
} | null;

type RecordedBug = {
    label: 'PREVIOUSLY RECORDED';
    position: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
};

type OutputState =
    | {
          kind: 'vimeo' | 'hls' | 'mp4';
          signature: string;
          blockId?: string | null;
          assetId?: string;
          title: string;
          hlsUrl?: string;
          url?: string;
          startOffsetSeconds: number;
          durationSeconds: number | null;
          serverSeconds: number;
          generatedAt: string;
          muted?: boolean;
          loop?: boolean;
          reason?: string;
          presentation?: 'fit' | 'vertical_blur';
          background?: 'black' | 'blur';
          recordedBug?: RecordedBug;
          live?: true;
          liveSourceType?: 'hls';
          liveStatus?: string;
          backgroundMusic: BackgroundMusic;
      }
    | {
          kind: 'youtube_live';
          signature: string;
          blockId: string;
          title: string;
          youtubeVideoId: string;
          youtubeUrl: string;
          embedUrl: string;
          startOffsetSeconds: number;
          durationSeconds: null;
          serverSeconds: number;
          generatedAt: string;
          live: true;
          liveSourceType: 'youtube';
          liveStatus: string;
          backgroundMusic: BackgroundMusic;
      }
    | {
          kind: 'slide';
          signature: string;
          blockId: string | null;
          title: string;
          slideId: string;
          templateId?: string | null;
          renderUrl?: string;
          imageUrl?: string;
          content?: string;
          startOffsetSeconds: number;
          durationSeconds: number;
          serverSeconds: number;
          generatedAt: string;
          backgroundMusic: BackgroundMusic;
      }
    | {
          kind: 'image';
          signature: string;
          blockId: string;
          assetId: string;
          title: string;
          imageUrl: string;
          startOffsetSeconds: number;
          durationSeconds: number;
          serverSeconds: number;
          generatedAt: string;
          backgroundMusic: BackgroundMusic;
      }
    | {
          kind: 'fallback';
          signature: string;
          reason: string;
          title: string;
          serverSeconds: number;
          generatedAt: string;
          backgroundMusic: BackgroundMusic;
      };

type Props = {
    debug?: boolean;
    startAt?: number | null;
    previewBlockId?: string;
    token?: string | undefined;
};

export function BrowserOutputRenderer({ debug = false, startAt, previewBlockId, token }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const musicRef = useRef<HTMLAudioElement>(null);
    const hlsRef = useRef<Hls | null>(null);
    const inFlightRef = useRef<AbortController | null>(null);
    const liveEndRef = useRef<string | null>(null);
    const deadSinceRef = useRef<number | null>(null);
    const deadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [armed, setArmed] = useState(false);
    const [state, setState] = useState<OutputState | null>(null);
    const [mediaState, setMediaState] = useState<MediaState>('idle');
    const [error, setError] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(0);

    const stateUrl = useMemo(() => {
        const params = new URLSearchParams();

        if (token) {
            params.set('token', token);
        }

        if (typeof startAt === 'number' && Number.isFinite(startAt)) {
            params.set('startAt', String(startAt));
        }

        if (previewBlockId) {
            params.set('previewBlockId', previewBlockId);
        }
        const query = params.toString();

        return `/api/output/channel/state${query ? `?${query}` : ''}`;
    }, [previewBlockId, startAt, token]);

    useEffect(
        () => () => {
            if (deadTimerRef.current) {
                clearTimeout(deadTimerRef.current);
            }
        },
        [],
    );

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        async function loadState() {
            if (inFlightRef.current) {
                if (!cancelled && !previewBlockId) {
                    timer = setTimeout(loadState, 2000);
                }

                return;
            }
            const controller = new AbortController();
            inFlightRef.current = controller;

            try {
                const response = await fetch(stateUrl, {
                    cache: 'no-store',
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`Output state returned ${response.status}`);
                }
                const payload = (await response.json()) as OutputState;

                if (cancelled) {
                    return;
                }
                setState(payload);
                setError(null);

                if (payload.signature !== state?.signature) {
                    setMediaState('syncing');
                }
            } catch (loadError) {
                if (cancelled || controller.signal.aborted) {
                    return;
                }
                setError(
                    loadError instanceof Error ? loadError.message : 'Output state unavailable',
                );
                setMediaState('errored');
            } finally {
                if (inFlightRef.current === controller) {
                    inFlightRef.current = null;
                }

                if (!cancelled && !previewBlockId) {
                    timer = setTimeout(loadState, 2000);
                }
            }
        }

        void loadState();

        return () => {
            cancelled = true;

            if (timer) {
                clearTimeout(timer);
            }
            inFlightRef.current?.abort();
            inFlightRef.current = null;
        };
    }, [previewBlockId, state?.signature, stateUrl]);

    useEffect(() => {
        const video = videoRef.current;

        if (!video || !state || !isVideoState(state)) {
            return;
        }

        hlsRef.current?.destroy();
        hlsRef.current = null;
        setMediaState('syncing');

        const src = videoSource(state);
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.muted = Boolean(state.muted);
        video.loop = Boolean(state.loop);
        video.playsInline = true;
        video.preload = 'auto';

        const offset = expectedOffset(state);
        const onLoadedMetadata = () => {
            seekVideo(video, offset, state.durationSeconds);
            setCurrentTime(video.currentTime);
            setMediaState('ready');

            if (armed) {
                void playVideo(video);
            }
        };
        const onPlaying = () => {
            deadSinceRef.current = null;

            if (deadTimerRef.current) {
                clearTimeout(deadTimerRef.current);
                deadTimerRef.current = null;
            }
            setMediaState('playing');
        };
        const onWaiting = () => setMediaState('waiting');
        const onStalled = () => {
            markLiveDeadSignal(state, 'stalled');
            setMediaState('stalled');
        };
        const onError = () => {
            markLiveDeadSignal(state, 'error');
            setError(video.error?.message || 'Media playback failed');
            setMediaState('errored');
        };
        const onEnded = () => {
            if (isLiveState(state)) {
                void reportLiveEnded(state, 'hls-ended');
            }
        };
        const onTimeUpdate = () => setCurrentTime(video.currentTime);

        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('playing', onPlaying);
        video.addEventListener('waiting', onWaiting);
        video.addEventListener('stalled', onStalled);
        video.addEventListener('error', onError);
        video.addEventListener('ended', onEnded);
        video.addEventListener('timeupdate', onTimeUpdate);

        let cancelled = false;

        if (isHlsSource(state)) {
            void (async () => {
                const { default: Hls } = await import('hls.js');

                if (cancelled || !Hls.isSupported()) {
                    if (!cancelled && !Hls.isSupported()) {
                        video.src = src;
                        video.load();
                    }

                    return;
                }
                const hls = new Hls({ startPosition: offset, enableWorker: true });
                hlsRef.current = hls;
                hls.on(Hls.Events.ERROR, (_event, data) => {
                    if (isLiveState(state)) {
                        markLiveDeadSignal(state, data.details || 'hls-error');
                    }

                    if (data.fatal) {
                        setError(data.details);
                        setMediaState('errored');
                    }
                });
                hls.loadSource(src);
                hls.attachMedia(video);
            })();
        } else {
            video.src = src;
            video.load();
        }

        return () => {
            cancelled = true;
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('playing', onPlaying);
            video.removeEventListener('waiting', onWaiting);
            video.removeEventListener('stalled', onStalled);
            video.removeEventListener('error', onError);
            video.removeEventListener('ended', onEnded);
            video.removeEventListener('timeupdate', onTimeUpdate);
        };
        // Media source setup must only rerun when the active output item changes.
        // `state` refreshes every poll to update generatedAt/offset, and including the whole
        // object here would restart the same video every 2 seconds.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [armed, state?.signature]);

    useEffect(() => {
        const video = videoRef.current;

        if (!video || !state || isVideoState(state)) {
            return;
        }
        hlsRef.current?.destroy();
        hlsRef.current = null;
        video.pause();
        video.removeAttribute('src');
        video.load();
        setCurrentTime(0);
        setMediaState(state.kind === 'fallback' ? 'fallback' : 'idle');
    }, [state]);

    useEffect(() => {
        const music = musicRef.current;

        if (!music) {
            return;
        }

        if (!state?.backgroundMusic?.tracks.length) {
            music.pause();

            return;
        }
        const track = state.backgroundMusic.tracks[0];

        if (!track) {
            return;
        }

        if (music.src !== track.url) {
            music.src = track.url;
        }
        music.volume = Math.max(0, Math.min(1, state.backgroundMusic.volume / 100));
        music.loop = true;

        if (armed && state.backgroundMusic.enabled) {
            void music.play().catch(() => undefined);
        } else {
            music.pause();
        }
    }, [armed, state]);

    async function armOutput() {
        setArmed(true);
        const video = videoRef.current;

        if (video && state && isVideoState(state)) {
            seekVideo(video, expectedOffset(state), state.durationSeconds);
            await playVideo(video);
        }

        if (musicRef.current && state?.backgroundMusic?.enabled) {
            await musicRef.current.play().catch(() => undefined);
        }
    }

    async function reportLiveEnded(stateToEnd: OutputState, reason: string) {
        if (!isLiveState(stateToEnd) || liveEndRef.current === stateToEnd.signature) {
            return;
        }
        liveEndRef.current = stateToEnd.signature;
        const params = new URLSearchParams();

        if (token) {
            params.set('token', token);
        }

        await fetch(`/api/output/live/end${params.size ? `?${params.toString()}` : ''}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                blockId: stateToEnd.blockId,
                reason,
                sourceType: stateToEnd.kind === 'youtube_live' ? 'youtube' : 'hls',
            }),
        }).catch(() => undefined);
    }

    function markLiveDeadSignal(stateToCheck: OutputState, signal: string) {
        if (!isLiveState(stateToCheck)) {
            return;
        }
        const now = Date.now();

        if (!deadSinceRef.current) {
            deadSinceRef.current = now;
        }

        if (!deadTimerRef.current) {
            deadTimerRef.current = setTimeout(() => {
                if (deadSinceRef.current) {
                    void reportLiveEnded(stateToCheck, 'dead-timeout');
                }
            }, LIVE_DEAD_TIMEOUT_MS);
        }

        if (now - deadSinceRef.current >= LIVE_DEAD_TIMEOUT_MS) {
            void reportLiveEnded(stateToCheck, signal === 'manual' ? 'manual' : 'dead-timeout');
        }
    }

    const outputState = state?.kind === 'fallback' ? 'fallback' : state ? 'program' : 'loading';
    const expected = state && 'startOffsetSeconds' in state ? expectedOffset(state) : 0;
    const driftSeconds =
        state && isVideoState(state) && mediaState === 'playing'
            ? Math.abs(currentTime - expected)
            : 0;
    const driftWarning = driftSeconds > 5;

    return (
        <main
            className="tv-output relative h-screen w-screen overflow-hidden bg-black text-white"
            data-testid="output-root"
            data-output-state={outputState}
            data-media-state={mediaState}
            data-current-time={Math.floor(currentTime)}
            data-expected-offset={Math.floor(expected)}
            data-drift-seconds={driftSeconds.toFixed(2)}
            data-drift-warning={driftWarning ? 'true' : 'false'}
        >
            <div className="absolute inset-0 grid place-items-center bg-black">
                <div
                    className="relative overflow-hidden bg-black"
                    style={{
                        width: 'min(100vw, calc(100vh * 16 / 9))',
                        height: 'min(100vh, calc(100vw * 9 / 16))',
                    }}
                >
                    <video ref={videoRef} className={videoClassName(state)} />
                    {shouldRenderBlurBackground(state) ? (
                        <>
                            <video
                                aria-hidden="true"
                                autoPlay
                                className="absolute inset-0 z-0 h-full w-full scale-110 bg-black object-cover object-center blur-2xl brightness-75"
                                loop
                                muted
                                playsInline
                                src={videoSource(state)}
                            />
                            <div className="pointer-events-none absolute inset-0 z-[1] bg-black/30" />
                        </>
                    ) : null}
                </div>
            </div>
            <audio ref={musicRef} />
            <VisualState state={state} mediaState={mediaState} />
            <RecordedBugOverlay state={state} />
            {!armed ? (
                <button
                    type="button"
                    className="absolute inset-0 z-30 grid place-items-center bg-black/70 text-left"
                    onClick={() => void armOutput()}
                >
                    <span className="max-w-xl rounded-md border border-white/20 bg-black/80 p-8">
                        <span className="block text-xs font-bold uppercase tracking-[0.28em] text-accent-positive">
                            Browser output ready
                        </span>
                        <span className="mt-3 block text-4xl font-semibold">Start Output</span>
                        <span className="mt-3 block text-sm leading-6 text-white/70">
                            Click once to unlock audio. Video is synced to current schedule time.
                        </span>
                    </span>
                </button>
            ) : null}
            {debug ? (
                <pre className="absolute bottom-4 left-4 z-40 max-w-xl whitespace-pre-wrap rounded border border-white/15 bg-black/75 p-3 text-xs text-white/70">
                    {JSON.stringify(
                        {
                            armed,
                            kind: state?.kind,
                            signature: state?.signature,
                            mediaState,
                            currentTime: Math.floor(currentTime),
                            expectedOffset: Math.floor(expected),
                            driftSeconds: Number(driftSeconds.toFixed(2)),
                            driftWarning,
                            error,
                        },
                        null,
                        2,
                    )}
                </pre>
            ) : null}
        </main>
    );
}

const LIVE_DEAD_TIMEOUT_MS = 60_000;

function RecordedBugOverlay({ state }: { state: OutputState | null }) {
    if (!state || !isVideoState(state) || !state.recordedBug) {
        return null;
    }

    return (
        <div
            className={recordedBugClassName(state.recordedBug.position)}
            data-testid="recorded-bug"
            data-position={state.recordedBug.position}
        >
            {state.recordedBug.label}
        </div>
    );
}

function recordedBugClassName(position: RecordedBug['position']) {
    const base =
        'pointer-events-none absolute z-20 rounded-sm border border-white/25 bg-black/75 px-4 py-2 text-sm font-extrabold uppercase tracking-[0.18em] text-white shadow-[0_2px_14px_rgba(0,0,0,0.45)]';
    const positions: Record<RecordedBug['position'], string> = {
        top_left: 'left-[4%] top-[5%]',
        top_right: 'right-[4%] top-[5%]',
        bottom_left: 'bottom-[5%] left-[4%]',
        bottom_right: 'bottom-[5%] right-[4%]',
    };

    return `${base} ${positions[position]}`;
}

function VisualState({ state, mediaState }: { state: OutputState | null; mediaState: MediaState }) {
    if (!state) {
        return <EmergencySlate title="Loading output" detail="Resolving active schedule." />;
    }

    if (state.kind === 'fallback') {
        return <EmergencySlate title={state.title} detail={state.reason} />;
    }

    if (state.kind === 'slide') {
        if (state.renderUrl) {
            return (
                <iframe
                    key={state.signature}
                    src={state.renderUrl}
                    title={state.title}
                    className="absolute inset-0 h-full w-full border-0"
                    allow="autoplay; fullscreen"
                />
            );
        }

        if (state.imageUrl) {
            return <img src={state.imageUrl} alt="" className="h-full w-full object-cover" />;
        }

        return <TextSlide title={state.title} content={state.content ?? ''} />;
    }

    if (state.kind === 'image') {
        return <img src={state.imageUrl} alt="" className="h-full w-full object-cover" />;
    }

    if (state.kind === 'youtube_live') {
        return <YouTubeLivePlayer key={state.signature} state={state} />;
    }

    if (mediaState === 'syncing') {
        return null;
    }

    if (mediaState === 'errored') {
        return <EmergencySlate title="Media error" detail={state.title} />;
    }

    return null;
}

function YouTubeLivePlayer({ state }: { state: Extract<OutputState, { kind: 'youtube_live' }> }) {
    const src = useMemo(() => youtubeFrameSrc(state.embedUrl), [state.embedUrl]);

    return (
        <div className="absolute inset-0 overflow-hidden bg-black">
            <iframe
                title="Live video"
                src={src}
                allow="autoplay; encrypted-media; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                className="absolute inset-0 h-full w-full border-0 bg-black opacity-100 blur-0"
            />
        </div>
    );
}

function youtubeFrameSrc(value: string) {
    try {
        const url = new URL(value);
        url.searchParams.set('origin', window.location.origin);

        return url.toString();
    } catch {
        return value;
    }
}

function EmergencySlate({ title, detail }: { title: string; detail: string }) {
    return (
        <section className="absolute inset-0 grid place-items-center bg-black px-12 text-center">
            <div>
                <p className="text-xs font-bold uppercase tracking-[0.28em] text-accent-positive">
                    RTV
                </p>
                <h1 className="mt-4 text-5xl font-semibold">{title}</h1>
                <p className="mt-4 text-lg text-white/60">{detail}</p>
            </div>
        </section>
    );
}

function TextSlide({ title, content }: { title: string; content: string }) {
    return (
        <section className="grid h-full w-full place-items-center bg-zinc-950 px-20 text-center">
            <div className="max-w-5xl">
                <h1 className="text-6xl font-semibold">{title}</h1>
                {content ? (
                    <p className="mt-8 whitespace-pre-wrap text-3xl leading-tight text-white/80">
                        {content}
                    </p>
                ) : null}
            </div>
        </section>
    );
}

function isVideoState(
    state: OutputState,
): state is Extract<OutputState, { kind: 'vimeo' | 'hls' | 'mp4' }> {
    return state.kind === 'vimeo' || state.kind === 'hls' || state.kind === 'mp4';
}

function isLiveState(
    state: OutputState,
): state is Extract<OutputState, { kind: 'youtube_live' | 'hls' }> & { live?: true } {
    return state.kind === 'youtube_live' || (state.kind === 'hls' && state.live === true);
}

function isHlsSource(state: Extract<OutputState, { kind: 'vimeo' | 'hls' | 'mp4' }>) {
    return state.kind === 'vimeo' || state.kind === 'hls' || videoSource(state).includes('.m3u8');
}

function videoSource(state: Extract<OutputState, { kind: 'vimeo' | 'hls' | 'mp4' }>) {
    return state.hlsUrl ?? state.url ?? '';
}

function expectedOffset(
    state: Pick<Extract<OutputState, { startOffsetSeconds: number }>, 'startOffsetSeconds'> & {
        generatedAt: string;
        durationSeconds?: number | null;
        loop?: boolean;
    },
) {
    const generated = Date.parse(state.generatedAt);
    const drift = Number.isFinite(generated) ? Math.max(0, (Date.now() - generated) / 1000) : 0;
    const raw = state.startOffsetSeconds + drift;

    if (!state.durationSeconds || state.durationSeconds <= 1) {
        return Math.max(0, raw);
    }

    if (state.loop) {
        return Math.max(0, raw % state.durationSeconds);
    }

    return Math.min(Math.max(0, raw), Math.max(0, state.durationSeconds - 1));
}

function seekVideo(video: HTMLVideoElement, offset: number, durationSeconds: number | null) {
    const safeOffset =
        durationSeconds && durationSeconds > 1 ? Math.min(offset, durationSeconds - 1) : offset;

    if (Number.isFinite(safeOffset)) {
        video.currentTime = Math.max(0, safeOffset);
    }
}

async function playVideo(video: HTMLVideoElement) {
    try {
        await video.play();
    } catch {
        // Browser may still require operator gesture; the Start Output button supplies it.
    }
}

function videoClassName(state: OutputState | null) {
    const visible = state && isVideoState(state);

    return [
        'absolute inset-0 z-10 h-full w-full bg-transparent object-contain object-center',
        visible ? 'opacity-100' : 'opacity-0',
    ].join(' ');
}

function shouldRenderBlurBackground(
    state: OutputState | null,
): state is Extract<OutputState, { kind: 'vimeo' | 'hls' | 'mp4' }> {
    return Boolean(
        state && isVideoState(state) && state.background === 'blur' && videoSource(state),
    );
}
