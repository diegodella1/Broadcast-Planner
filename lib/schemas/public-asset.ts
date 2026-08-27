import { z } from 'zod';

export const createPublicAssetSchema = z.object({
    url: z.string().trim().url().max(2048),
});
