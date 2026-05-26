import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { middleware } from '../middleware';

import { appUrl } from './app-url';

describe('root-domain routing', () => {
    it('builds app URLs without the old /rtvtime base path', () => {
        const previous = process.env.NEXT_PUBLIC_APP_BASE_URL;
        process.env.NEXT_PUBLIC_APP_BASE_URL = 'https://rtvtime.diegodella.ar';

        expect(String(appUrl('/api/health'))).toBe('https://rtvtime.diegodella.ar/api/health');

        if (previous === undefined) {
            delete process.env.NEXT_PUBLIC_APP_BASE_URL;
        } else {
            process.env.NEXT_PUBLIC_APP_BASE_URL = previous;
        }
    });

    it('redirects legacy /rtvtime paths to root paths', () => {
        const request = new NextRequest('https://rtvtime.diegodella.ar/rtvtime/manual?x=1');
        const response = middleware(request);

        expect(response.status).toBe(308);
        expect(response.headers.get('location')).toBe('https://rtvtime.diegodella.ar/manual?x=1');
    });

    it('keeps manual and pending public outside admin login', () => {
        const previous = process.env.ADMIN_BOOTSTRAP_TOKEN;
        process.env.ADMIN_BOOTSTRAP_TOKEN = 'required-admin-token';

        for (const path of ['/manual', '/pending']) {
            const request = new NextRequest(`https://rtvtime.diegodella.ar${path}`);
            const response = middleware(request);

            expect(response.status, path).toBe(200);
            expect(response.headers.get('location'), path).toBeNull();
        }

        if (previous === undefined) {
            delete process.env.ADMIN_BOOTSTRAP_TOKEN;
        } else {
            process.env.ADMIN_BOOTSTRAP_TOKEN = previous;
        }
    });

    it('redirects anonymous admin requests to login with return_to', () => {
        const previous = process.env.ADMIN_BOOTSTRAP_TOKEN;
        process.env.ADMIN_BOOTSTRAP_TOKEN = 'required-admin-token';

        const request = new NextRequest('https://rtvtime.diegodella.ar/admin/output?debug=1');
        const response = middleware(request);

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(
            'https://rtvtime.diegodella.ar/admin/login?return_to=%2Fadmin%2Foutput%3Fdebug%3D1',
        );

        if (previous === undefined) {
            delete process.env.ADMIN_BOOTSTRAP_TOKEN;
        } else {
            process.env.ADMIN_BOOTSTRAP_TOKEN = previous;
        }
    });
});
