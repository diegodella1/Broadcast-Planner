import { z } from 'zod';

/**
 * Validation surface mirrors the prior route, which read the JSON body as
 * `Record<string, unknown>` with no field-level checks and let
 * `parseMusicPreference` in lib/operator-preferences.ts normalise the values
 * (enabled coerced to boolean, volume clamped to [0, 100] with default 50,
 * fade narrowed to 'none' | 'short').
 *
 * The schema therefore enforces only that the body is a plain object and
 * leaves the field normalisation untouched. Unknown extra keys pass through
 * for forward compatibility.
 */
export const updateMusicPreferenceSchema = z
    .object({
        enabled: z.unknown().optional(),
        volume: z.unknown().optional(),
        fade: z.unknown().optional(),
    })
    .passthrough();
export type UpdateMusicPreferenceInput = z.infer<typeof updateMusicPreferenceSchema>;
