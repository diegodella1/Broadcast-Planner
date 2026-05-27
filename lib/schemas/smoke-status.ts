import { z } from 'zod';

export const smokeStatusSchema = z.object({
    status: z.enum(['ok', 'fail']),
    label: z.string().min(1).max(120).optional(),
    recordedAt: z.string().datetime().optional(),
});
export type SmokeStatusPayload = z.infer<typeof smokeStatusSchema>;
