import { describe, expect, it } from 'vitest';
import { err, extractError, ok, resultToHttp, type Result } from './result';

describe('ok', () => {
    it('produces a success result with the given data', () => {
        const result = ok(42);
        expect(result).toEqual({ success: true, data: 42 });
    });

    it('preserves object identity for the data payload', () => {
        const payload = { id: 'abc', count: 3 };
        const result = ok(payload);
        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data).toBe(payload);
        }
    });
});

describe('err', () => {
    it('produces a failure result with the given error string', () => {
        const result = err('invalid input');
        expect(result).toEqual({ success: false, error: 'invalid input' });
    });

    it('passes the error string through verbatim', () => {
        const message = 'unexpected: db connection refused';
        const result = err(message);
        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toBe(message);
        }
    });
});

describe('extractError', () => {
    it('returns the message of an Error instance', () => {
        const error = new Error('database offline');
        expect(extractError(error)).toBe('database offline');
    });

    it('returns the message field on a plain object (Postgres/Supabase error shape)', () => {
        const pgError = {
            code: '23505',
            message: 'duplicate key value violates unique constraint',
            details: 'Key (id)=(abc) already exists.',
            hint: null,
        };
        expect(extractError(pgError)).toBe('duplicate key value violates unique constraint');
    });

    it('falls back to String(error) when message is missing', () => {
        expect(extractError({ code: 'X' })).toBe('[object Object]');
    });

    it('falls back to String(error) when message is empty', () => {
        expect(extractError({ message: '' })).toBe('[object Object]');
    });

    it('falls back to String(error) when message is non-string', () => {
        expect(extractError({ message: 42 })).toBe('[object Object]');
    });

    it('handles primitive errors', () => {
        expect(extractError('plain string error')).toBe('plain string error');
        expect(extractError(404)).toBe('404');
    });

    it('handles null and undefined', () => {
        expect(extractError(null)).toBe('null');
        expect(extractError(undefined)).toBe('undefined');
    });
});

describe('resultToHttp', () => {
    it('returns a 200 NextResponse with { data } on success by default', async () => {
        const result: Result<{ foo: string }> = ok({ foo: 'bar' });
        const response = resultToHttp(result);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ data: { foo: 'bar' } });
    });

    it('returns a 400 NextResponse with { error } on failure by default', async () => {
        const result: Result<never> = err('bad request');
        const response = resultToHttp(result);
        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body).toEqual({ error: 'bad request' });
    });

    it('honors a custom success status code', async () => {
        const response = resultToHttp(ok({ created: true }), 201);
        expect(response.status).toBe(201);
        const body = await response.json();
        expect(body).toEqual({ data: { created: true } });
    });

    it('honors a custom error status code', async () => {
        const response = resultToHttp(err('not found'), 200, 404);
        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body).toEqual({ error: 'not found' });
    });

    it('passes the error string through to the response body unchanged', async () => {
        const message = 'validation failed: name is required';
        const response = resultToHttp(err(message), 200, 422);
        expect(response.status).toBe(422);
        const body = await response.json();
        expect(body).toEqual({ error: message });
    });
});
