import { z } from 'zod';

const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const goLiveReutersSchema = z.object({
    assetId: z.string().uuid('assetId must be a UUID'),
});
export type GoLiveReutersInput = z.infer<typeof goLiveReutersSchema>;

export const scheduleReutersBlockSchema = z.object({
    assetId: z.string().uuid('assetId must be a UUID'),
    startAt: z.string().regex(timeRegex, 'startAt must be HH:MM or HH:MM:SS'),
    airDate: z.string().regex(isoDateRegex, 'airDate must be YYYY-MM-DD').optional(),
    durationSeconds: z.coerce.number().int().positive().max(7200).default(1800),
});
export type ScheduleReutersBlockInput = z.infer<typeof scheduleReutersBlockSchema>;
