import { z } from 'zod';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const timeSchema = z
    .string()
    .regex(/^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'must be HH:MM or HH:MM:SS');
const optionalIsoDateSchema = z.preprocess(
    (value) => (value === '' ? undefined : value),
    isoDateSchema.optional(),
);
const optionalTimeSchema = z.preprocess(
    (value) => (value === '' ? undefined : value),
    timeSchema.optional(),
);
const blockIdSchema = z.string().trim().min(1).max(128);

export const cancelLiveSchema = z
    .object({
        blockId: z.preprocess(
            (value) => (value === '' ? undefined : value),
            blockIdSchema.optional(),
        ),
    })
    .strict();

export const updateLiveLowerThirdSchema = z
    .object({
        visible: z.boolean(),
        text: z.string().trim().max(160).default(''),
    })
    .strict();

export const scheduleLiveSchema = z
    .object({
        date: optionalIsoDateSchema,
        title: z.string().trim().max(160).optional(),
        startTime: optionalTimeSchema,
        liveSourceType: z.enum(['youtube', 'hls']).default('youtube'),
        liveUrl: z.string().trim().min(1).max(2048),
        timingMode: z.enum(['now', 'future']).default('now'),
    })
    .strict();

export const endLiveSchema = z
    .object({
        blockId: blockIdSchema,
        reason: z
            .enum(['youtube-ended', 'hls-ended', 'dead-timeout', 'manual', 'failed'])
            .default('manual'),
        sourceType: z.enum(['youtube', 'hls']).optional(),
    })
    .strict();
