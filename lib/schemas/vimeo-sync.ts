import { z } from 'zod';

const formString = z.preprocess(
    (value) => (value === null || value === undefined ? '' : String(value)),
    z.string(),
);

/**
 * Validation surface mirrors the prior route, which read two FormData fields
 * with `String(form.get('field') ?? '')`. `scope_uri` was forwarded to
 * `syncVimeoCatalog` and `return_to` was used as a redirect base. No length,
 * format, or allowed-value checks existed previously, so the schema only
 * enforces "string-ish" inputs.
 */
export const syncVimeoCatalogSchema = z.object({
    return_to: formString,
    scope_uri: formString,
});
export type SyncVimeoCatalogInput = z.infer<typeof syncVimeoCatalogSchema>;
