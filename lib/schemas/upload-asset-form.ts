import { z } from 'zod';

const formString = z.preprocess(
    (value) => (value === null || value === undefined ? '' : String(value)),
    z.string(),
);

const requiredFile = z.preprocess(
    (value) => (value instanceof File ? value : undefined),
    z.instanceof(File).refine((file) => file.size > 0, { message: 'Select a media file' }),
    { message: 'Select a media file' },
);

/**
 * Validation surface mirrors the prior route, which only enforced:
 *   - `media_file` (or fallback `video_file`) must be a File with size > 0
 *   - `return_to` was read with `String(form.get('return_to') || '/admin/assets?uploaded=1')`
 *
 * All other FormData fields (title, asset_type, orientation, duration_seconds,
 * detected_*, metadata_json) are forwarded into `uploadedMediaFieldsFromForm` +
 * `resolveUploadedMedia`, where their downstream validation already lives. The
 * schema only encodes what the route handler itself enforced, so no new
 * rejections or acceptances are introduced.
 */
export const uploadAssetFormSchema = z.object({
    media_file: requiredFile,
    return_to: formString,
});
export type UploadAssetFormInput = z.infer<typeof uploadAssetFormSchema>;
