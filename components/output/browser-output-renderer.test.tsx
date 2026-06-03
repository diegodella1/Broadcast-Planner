import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrowserOutputRenderer } from './browser-output-renderer';

vi.mock('hls.js', () => ({
    default: class MockHls {
        static isSupported() {
            return false;
        }
        static Events = { ERROR: 'error' };
        on() {}
        loadSource() {}
        attachMedia() {}
        destroy() {}
    },
}));

describe('BrowserOutputRenderer', () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const pause = vi.fn();
    const load = vi.fn();

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.resetAllMocks();
        play.mockResolvedValue(undefined);
        vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(play);
        vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
        vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(load);
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('keeps output armed across an empty gap and auto-plays the next video', async () => {
        const states = [videoState('a', 'First'), fallbackState, videoState('b', 'Second')];
        global.fetch = vi.fn(async () => jsonResponse(states.shift() ?? videoState('b', 'Second')));

        render(<BrowserOutputRenderer debug token="token" />);

        await screen.findByText('Browser output ready');
        fireEvent.click(screen.getByRole('button', { name: /Start Output/i }));

        const video = document.querySelector('video')!;
        fireEvent.loadedMetadata(video);
        await waitFor(() => expect(play).toHaveBeenCalled());
        const playsBeforeGap = play.mock.calls.length;
        const pausesBeforeGap = pause.mock.calls.length;

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(pause.mock.calls.length).toBeGreaterThan(pausesBeforeGap);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        await waitFor(() =>
            expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThanOrEqual(3),
        );
        fireEvent.loadedMetadata(video);

        await waitFor(() => expect(play.mock.calls.length).toBeGreaterThan(playsBeforeGap));
        expect(screen.queryByRole('button', { name: /Start Output/i })).not.toBeInTheDocument();
    }, 10000);

    it('plays fallback loop video muted when the state requests it', async () => {
        global.fetch = vi.fn(async () =>
            jsonResponse({
                ...videoState('fallback', 'Fallback loop'),
                signature: 'fallback-loop:asset-fallback',
                reason: 'no-active-block',
                muted: true,
                loop: true,
            }),
        );

        render(<BrowserOutputRenderer token="token" />);

        await screen.findByText('Browser output ready');
        const video = document.querySelector('video')!;
        await waitFor(() => expect(video.muted).toBe(true));
        expect(video.loop).toBe(true);
    });

    it('renders a blurred background layer for vertical videos', async () => {
        global.fetch = vi.fn(async () =>
            jsonResponse({
                ...videoState('vertical', 'Vertical clip'),
                presentation: 'vertical_blur',
                background: 'blur',
            }),
        );

        render(<BrowserOutputRenderer token="token" />);

        await screen.findByText('Browser output ready');

        const videos = document.querySelectorAll('video');
        expect(videos).toHaveLength(2);
        expect(videos[0]).toHaveClass('object-contain');
        expect(videos[1]).toHaveAttribute('aria-hidden', 'true');
        expect(videos[1]).toHaveClass('object-cover');
        expect(videos[1]).toHaveAttribute('src', 'https://example.com/vertical.mp4');
    });

    it('renders the previously recorded bug at the requested position', async () => {
        global.fetch = vi.fn(async () =>
            jsonResponse({
                ...videoState('recorded', 'Recorded program'),
                recordedBug: { label: 'PREVIOUSLY RECORDED', position: 'bottom_right' },
            }),
        );

        render(<BrowserOutputRenderer token="token" />);

        const bug = await screen.findByTestId('recorded-bug');
        expect(bug).toHaveTextContent('PREVIOUSLY RECORDED');
        expect(bug).toHaveAttribute('data-position', 'bottom_right');
    });

    it('masks youtube live with blur for 4.5 seconds before revealing it', async () => {
        global.fetch = vi.fn(async () => jsonResponse(youtubeLiveState()));

        render(<BrowserOutputRenderer token="token" />);

        const iframe = await screen.findByTitle('Live video');
        expect(iframe).toHaveClass('blur-xl');
        expect(iframe).toHaveClass('scale-[1.04]');
        expect(screen.getByTestId('youtube-live-start-mask')).toHaveClass('bg-black/70');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(4500);
        });

        expect(iframe).toHaveClass('blur-0');
        expect(iframe).toHaveClass('scale-100');
        expect(screen.queryByTestId('youtube-live-start-mask')).not.toBeInTheDocument();
    });

    it('renders the live lower third overlay and text when requested', async () => {
        global.fetch = vi.fn(async () =>
            jsonResponse({
                ...youtubeLiveState(),
                lowerThird: {
                    visible: true,
                    text: 'Markets live',
                    assetUrl: '/l3/l32026full.png',
                },
            }),
        );

        render(<BrowserOutputRenderer token="token" />);

        const overlay = await screen.findByTestId('live-lower-third');
        await waitFor(() => expect(overlay).toHaveAttribute('data-visible', 'true'));
        expect(screen.getByText('Markets live')).toBeInTheDocument();
        expect(overlay.querySelector('img')).toHaveAttribute('src', '/l3/l32026full.png');
    });

    it('hides the live lower third with transition state when requested', async () => {
        const states = [
            {
                ...youtubeLiveState(),
                lowerThird: {
                    visible: true,
                    text: 'Markets live',
                    assetUrl: '/l3/l32026full.png',
                },
            },
            {
                ...youtubeLiveState(),
                lowerThird: {
                    visible: true,
                    text: 'Markets live',
                    assetUrl: '/l3/l32026full.png',
                },
            },
            youtubeLiveState(),
        ];
        global.fetch = vi.fn(async () => jsonResponse(states.shift() ?? youtubeLiveState()));

        render(<BrowserOutputRenderer token="token" />);

        await waitFor(() =>
            expect(screen.getByTestId('live-lower-third')).toHaveAttribute('data-visible', 'true'),
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });

        const overlay = screen.getByTestId('live-lower-third');
        expect(overlay).toHaveAttribute('data-visible', 'false');

        expect(overlay).toHaveStyle({ opacity: '0' });
    });

    it('does not show a technical syncing slate during video source changes', async () => {
        const states = [videoState('a', 'First'), videoState('b', 'Second')];
        global.fetch = vi.fn(async () => jsonResponse(states.shift() ?? videoState('b', 'Second')));

        render(<BrowserOutputRenderer token="token" />);

        await screen.findByText('Browser output ready');
        expect(screen.queryByText('Syncing output')).not.toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });

        await waitFor(() =>
            expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThanOrEqual(2),
        );
        expect(screen.queryByText('Syncing output')).not.toBeInTheDocument();
    });

    it('pauses and resumes background music without resetting the track', async () => {
        const music = backgroundMusic(true);
        const states = [
            slideState('a', 'First slide', music),
            { ...videoState('b', 'Video'), backgroundMusic: backgroundMusic(false) },
            slideState('c', 'Second slide', music),
        ];
        global.fetch = vi.fn(async () =>
            jsonResponse(states.shift() ?? slideState('c', 'Second slide', music)),
        );

        render(<BrowserOutputRenderer token="token" />);

        await screen.findByText('Browser output ready');
        fireEvent.click(screen.getByRole('button', { name: /Start Output/i }));

        const audio = document.querySelector('audio')!;
        await waitFor(() => expect(audio.src).toBe('https://example.com/music.mp3'));
        audio.currentTime = 17;

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        await waitFor(() =>
            expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThanOrEqual(2),
        );
        expect(pause.mock.contexts).toContain(audio);
        expect(audio.src).toBe('https://example.com/music.mp3');
        expect(audio.currentTime).toBe(17);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        await waitFor(() =>
            expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThanOrEqual(3),
        );
        expect(audio.src).toBe('https://example.com/music.mp3');
        expect(audio.currentTime).toBe(17);
        expect(play.mock.contexts).toContain(audio);
    }, 10000);
});

function jsonResponse(payload: unknown) {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function videoState(id: string, title: string) {
    return {
        kind: 'mp4',
        signature: `mp4:${id}`,
        blockId: `block-${id}`,
        assetId: `asset-${id}`,
        title,
        url: `https://example.com/${id}.mp4`,
        startOffsetSeconds: 0,
        durationSeconds: 60,
        serverSeconds: 0,
        generatedAt: new Date().toISOString(),
        backgroundMusic: null,
    };
}

function slideState(
    id: string,
    title: string,
    music: NonNullable<ReturnType<typeof backgroundMusic>>,
) {
    return {
        kind: 'slide',
        signature: `slide:${id}`,
        blockId: `block-${id}`,
        title,
        slideId: `slide-${id}`,
        content: 'Slide content',
        startOffsetSeconds: 0,
        durationSeconds: 60,
        serverSeconds: 0,
        generatedAt: new Date().toISOString(),
        backgroundMusic: music,
    };
}

function backgroundMusic(enabled: boolean) {
    return {
        enabled,
        volume: 50,
        fade: 'short' as const,
        tracks: [{ id: 'music-1', title: 'Music', url: 'https://example.com/music.mp3' }],
    };
}

function youtubeLiveState() {
    return {
        kind: 'youtube_live',
        signature: 'youtube-live:block-live:dQw4w9WgXcQ:scheduled',
        blockId: 'block-live',
        title: 'Live',
        youtubeVideoId: 'dQw4w9WgXcQ',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&controls=0',
        live: true,
        liveSourceType: 'youtube',
        liveStatus: 'scheduled',
        lowerThird: {
            visible: false,
            text: '',
            assetUrl: '/l3/l32026full.png',
        },
        serverSeconds: 0,
        generatedAt: new Date().toISOString(),
        backgroundMusic: null,
    };
}

const fallbackState = {
    kind: 'fallback',
    signature: 'fallback:no-active-block',
    reason: 'no-active-block',
    title: 'RTV fallback',
    serverSeconds: 0,
    generatedAt: new Date().toISOString(),
    backgroundMusic: null,
};
