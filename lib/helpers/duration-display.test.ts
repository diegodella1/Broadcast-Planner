import { describe, expect, it } from 'vitest';
import { getDurationDisplay } from './duration-display';

describe('getDurationDisplay', () => {
    it('returns kind=live when reuters source has no duration', () => {
        expect(
            getDurationDisplay({
                durationSeconds: null,
                sourceType: 'public_url',
                playbackKind: 'hls',
            }),
        ).toEqual({
            kind: 'live',
        });
    });

    it('returns numeric duration for a public URL with a known duration', () => {
        expect(getDurationDisplay({ durationSeconds: 30, sourceType: 'public_url' })).toEqual({
            kind: 'duration',
            seconds: 30,
        });
    });

    it('falls back to 0 seconds when duration is null and source is not live', () => {
        expect(getDurationDisplay({ durationSeconds: null, sourceType: 'public_url' })).toEqual({
            kind: 'duration',
            seconds: 0,
        });
    });

    it('treats reuters with explicit 0 duration as numeric, not live', () => {
        expect(
            getDurationDisplay({
                durationSeconds: 0,
                sourceType: 'public_url',
                playbackKind: 'hls',
            }),
        ).toEqual({
            kind: 'duration',
            seconds: 0,
        });
    });

    it('does not trigger live for hls with null duration', () => {
        expect(getDurationDisplay({ durationSeconds: null, sourceType: 'public_url' })).toEqual({
            kind: 'duration',
            seconds: 0,
        });
    });
});
