import { z } from 'zod';

const optionalFormString = z
    .preprocess((value) => (value === null || value === undefined ? '' : String(value)), z.string())
    .transform((value) => (value === '' ? undefined : value));

/**
 * Validation surface mirrors the prior route, which read three FormData fields
 * with `String(form.get('field') ?? '')` and coerced empty strings to
 * `undefined` before passing to `saveVimeoSettings`. No length, format, or
 * allowed-value checks existed previously.
 */
export const updateVimeoSettingsSchema = z.object({
    vimeo_token: optionalFormString,
    vimeo_folder_uri: optionalFormString,
    timezone: optionalFormString,
});
export type UpdateVimeoSettingsInput = z.infer<typeof updateVimeoSettingsSchema>;
