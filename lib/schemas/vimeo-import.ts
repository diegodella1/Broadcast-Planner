import { z } from 'zod';

const formString = z.preprocess(
    (value) => (value === null || value === undefined ? '' : String(value)),
    z.string(),
);

/**
 * Validation surface mirrors the prior route, which read two FormData fields
 * with `String(form.get('field') ?? '')`. `video_uri` was then passed through
 * `normalizeVimeoUri` (a normaliser, not a validator) and `return_to` was used
 * as a redirect base. No length, format, or allowed-value checks existed
 * previously, so the schema only enforces "string-ish" inputs and preserves
 * the prior behaviour of emitting `''` when the field is absent.
 */
export const importVimeoVideoSchema = z.object({
    video_uri: formString,
    return_to: formString,
});
export type ImportVimeoVideoInput = z.infer<typeof importVimeoVideoSchema>;
