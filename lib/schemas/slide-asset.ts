import { z } from 'zod';

const slideTypeEnum = z.enum(['image', 'html', 'template', 'markdown']);
const slideStatusEnum = z.enum(['draft', 'ready', 'archived']);

const optionalString = (max = 10000) =>
    z
        .string()
        .max(max)
        .transform((value) => (value === '' ? undefined : value))
        .optional();

const optionalDuration = z
    .union([
        z.coerce.number().int().positive().max(86400),
        z.literal('').transform(() => undefined),
        z.literal(0).transform(() => undefined),
    ])
    .optional();

export const createSlideAssetSchema = z.object({
    title: z.string().min(1, 'title is required').max(200),
    slideType: slideTypeEnum,
    content: optionalString(10000),
    imageUrl: optionalString(2000),
    htmlContent: optionalString(50000),
    defaultDurationSeconds: optionalDuration,
    status: slideStatusEnum.default('ready'),
});
export type CreateSlideAssetInput = z.infer<typeof createSlideAssetSchema>;
