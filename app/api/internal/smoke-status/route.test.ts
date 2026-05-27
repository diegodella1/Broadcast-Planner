import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

import { writeSmokeStatus } from '@/lib/health/smoke-status';

vi.mock('@/lib/health/smoke-status', () => ({
    writeSmokeStatus: vi.fn(),
}));

const originalEnv = { ...process.env };

describe('POST /api/internal/smoke-status', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        process.env = { ...originalEnv };
        process.env.SMOKE_WRITE_TOKEN = 'smoke-secret';
    });

    it('rejects when SMOKE_WRITE_TOKEN is not configured', async () => {
        delete process.env.SMOKE_WRITE_TOKEN;
        const response = await POST(
            new Request('http://test/api/internal/smoke-status', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ status: 'ok' }),
            }),
        );

        expect(response.status).toBe(503);
        expect(writeSmokeStatus).not.toHaveBeenCalled();
    });

    it('rejects when x-smoke-token header is missing', async () => {
        const response = await POST(
            new Request('http://test/api/internal/smoke-status', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ status: 'ok' }),
            }),
        );

        expect(response.status).toBe(401);
        expect(writeSmokeStatus).not.toHaveBeenCalled();
    });

    it('rejects when x-smoke-token does not match', async () => {
        const response = await POST(
            new Request('http://test/api/internal/smoke-status', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-smoke-token': 'wrong' },
                body: JSON.stringify({ status: 'ok' }),
            }),
        );

        expect(response.status).toBe(401);
        expect(writeSmokeStatus).not.toHaveBeenCalled();
    });

    it('rejects an invalid status value', async () => {
        const response = await POST(
            new Request('http://test/api/internal/smoke-status', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-smoke-token': 'smoke-secret' },
                body: JSON.stringify({ status: 'maybe' }),
            }),
        );

        expect(response.status).toBe(400);
        expect(writeSmokeStatus).not.toHaveBeenCalled();
    });

    it('persists smoke status when payload + token are valid', async () => {
        const recordedAt = '2026-05-26T12:00:00.000Z';
        const response = await POST(
            new Request('http://test/api/internal/smoke-status', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-smoke-token': 'smoke-secret' },
                body: JSON.stringify({ status: 'ok', label: 'ci', recordedAt }),
            }),
        );

        expect(response.status).toBe(200);
        expect(writeSmokeStatus).toHaveBeenCalledWith({
            status: 'ok',
            label: 'ci',
            recordedAt,
        });
        const body = await response.json();
        expect(body).toEqual({ ok: true, recordedAt });
    });

    it('defaults recordedAt to now when omitted', async () => {
        const response = await POST(
            new Request('http://test/api/internal/smoke-status', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-smoke-token': 'smoke-secret' },
                body: JSON.stringify({ status: 'fail', label: 'ci' }),
            }),
        );

        expect(response.status).toBe(200);
        expect(writeSmokeStatus).toHaveBeenCalledTimes(1);
        const call = vi.mocked(writeSmokeStatus).mock.calls[0]?.[0];
        expect(call?.status).toBe('fail');
        expect(call?.label).toBe('ci');
        expect(typeof call?.recordedAt).toBe('string');
        expect(Number.isFinite(Date.parse(call?.recordedAt ?? ''))).toBe(true);
    });
});
