import { NextResponse } from 'next/server';

export type Result<T> = { success: true; data: T } | { success: false; error: string };

export const ok = <T>(data: T): Result<T> => ({ success: true, data });

export const err = (error: string): Result<never> => ({ success: false, error });

export function resultToHttp<T>(
    result: Result<T>,
    successStatus = 200,
    errorStatus = 400,
): Response {
    if (result.success) {
        return NextResponse.json({ data: result.data }, { status: successStatus });
    }

    return NextResponse.json({ error: result.error }, { status: errorStatus });
}
