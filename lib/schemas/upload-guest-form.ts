import { z } from 'zod';

const formString = z.preprocess(
    (value) => (value === null || value === undefined ? '' : String(value)),
    z.string(),
);

const requiredTrimmed = (message: string) =>
    formString.transform((value) => value.trim()).pipe(z.string().min(1, message));

const guestKindEnum = z.preprocess(
    (value) => (value === null || value === undefined ? '' : String(value)),
    z.enum(['photo', 'video'], { message: 'Invalid guest media kind' }),
);

const requiredFile = z.preprocess(
    (value) => (value instanceof File ? value : undefined),
    z.instanceof(File).refine((file) => file.size > 0, { message: 'Select a media file' }),
    { message: 'Select a media file' },
);

/**
 * Validation surface mirrors the prior route, which manually enforced:
 *   - `guest_id` required after trim ("Guest is required")
 *   - `kind` must equal 'photo' or 'video' ("Invalid guest media kind")
 *   - `media_file` (or fallback `video_file`) must be a File with size > 0
 *   - if kind=photo: file.type must start with 'image/'
 *   - if kind=video: file.type must start with 'video/'
 *   - `title` was read with `String(form.get('title') || file.name || 'Guest media').trim()`
 *   - `orientation` was read with `String(form.get('orientation') || 'auto')`
 *   - `duration_seconds` / `detected_*` were forwarded as `string | null`
 *   - `return_to` was read with `String(form.get('return_to') || ...)`
 *
 * The schema validates `guest_id`, `kind`, `media_file`, `return_to`. The
 * kind/file-type cross-field check is enforced via `superRefine` to mirror
 * the previous behaviour exactly (same message strings, same order). Other
 * fields are intentionally not validated here because the route forwards
 * them to `uploadMediaFile` where downstream validation already exists.
 */
export const uploadGuestFormSchema = z
    .object({
        guest_id: requiredTrimmed('Guest is required'),
        kind: guestKindEnum,
        media_file: requiredFile,
        return_to: formString,
    })
    .superRefine((value, ctx) => {
        if (value.kind === 'photo' && !value.media_file.type.startsWith('image/')) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['media_file'],
                message: 'Guest photo must be an image',
            });
        }

        if (value.kind === 'video' && !value.media_file.type.startsWith('video/')) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['media_file'],
                message: 'Guest video must be MP4 or WebM',
            });
        }
    });
export type UploadGuestFormInput = z.infer<typeof uploadGuestFormSchema>;
