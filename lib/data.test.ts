import { afterEach, describe, expect, it } from 'vitest';
import { handleDataFailure, shouldUseDemoData } from './data';

const originalDemoFlag = process.env.ALLOW_DEMO_DATA;
const originalAppBaseUrl = process.env.APP_BASE_URL;

afterEach(() => {
    if (originalDemoFlag === undefined) {
        delete process.env.ALLOW_DEMO_DATA;
    } else {
        process.env.ALLOW_DEMO_DATA = originalDemoFlag;
    }

    if (originalAppBaseUrl === undefined) {
        delete process.env.APP_BASE_URL;
    } else {
        process.env.APP_BASE_URL = originalAppBaseUrl;
    }
});

describe('data fallback policy', () => {
    it('does not use demo data unless explicitly enabled', () => {
        delete process.env.ALLOW_DEMO_DATA;

        expect(shouldUseDemoData()).toBe(false);
        expect(() => handleDataFailure(new Error('supabase down'), 'demo')).toThrow(
            'Database unavailable: supabase down',
        );
    });

    it('allows demo data behind ALLOW_DEMO_DATA', () => {
        process.env.ALLOW_DEMO_DATA = 'true';

        expect(shouldUseDemoData()).toBe(true);
        expect(handleDataFailure(new Error('supabase down'), 'demo')).toBe('demo');
    });

    it('rejects demo data in production-like runtimes', () => {
        process.env.ALLOW_DEMO_DATA = 'true';
        process.env.APP_BASE_URL = 'https://broadcast-planner.diegodella.ar';

        expect(() => shouldUseDemoData()).toThrow(
            'ALLOW_DEMO_DATA cannot be enabled in production',
        );
        expect(() => handleDataFailure(new Error('supabase down'), 'demo')).toThrow(
            'ALLOW_DEMO_DATA cannot be enabled in production',
        );
    });
});
