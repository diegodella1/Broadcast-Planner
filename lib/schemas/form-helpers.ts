import { z } from 'zod';

/**
 * Parse a FormData object against a Zod schema. Throws an Error with a
 * "<path>: <message>" prefix on the first issue, which Next 15 surfaces to
 * the route segment's error.tsx boundary.
 */
export function parseFormData<TSchema extends z.ZodTypeAny>(
    schema: TSchema,
    raw: Record<string, unknown>,
): z.infer<TSchema> {
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
        throw new Error(formatZodError(parsed.error));
    }

    return parsed.data;
}

export function formatZodError(error: z.ZodError): string {
    const first = error.issues[0];

    if (!first) {
        return 'Invalid form input';
    }
    const path = first.path.length > 0 ? first.path.join('.') : 'input';

    return `${path}: ${first.message}`;
}

/**
 * Strip keys whose value is `undefined`. Useful when an upstream type uses
 * `field?: T` (optional, exactOptionalPropertyTypes) and the parsed data
 * holds explicit `undefined` for missing optional fields.
 */
export function stripUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
    const out: Partial<T> = {};

    for (const key of Object.keys(input) as Array<keyof T>) {
        const value = input[key];

        if (value !== undefined) {
            out[key] = value;
        }
    }

    return out;
}
