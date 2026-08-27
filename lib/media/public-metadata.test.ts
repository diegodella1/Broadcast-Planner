import { describe, expect, it } from 'vitest';

import { canonicalizePublicUrl, isPrivateAddress } from './public-metadata';

describe('public metadata URL safety', () => {
    it('canonicalizes HTTP URLs and removes fragments', () => {
        expect(canonicalizePublicUrl('https://example.com/video?id=1#chapter')).toBe(
            'https://example.com/video?id=1',
        );
    });

    it('rejects credentials and non-HTTP protocols', () => {
        expect(() => canonicalizePublicUrl('https://user:pass@example.com/video')).toThrow(
            'embedded credentials',
        );
        expect(() => canonicalizePublicUrl('file:///etc/passwd')).toThrow('HTTP(S)');
    });

    it.each([
        '127.0.0.1',
        '10.0.0.1',
        '172.16.0.1',
        '192.168.1.1',
        '169.254.1.1',
        '::1',
        '::ffff:127.0.0.1',
        'fe80::1',
        'fc00::1',
    ])('blocks private address %s', (address) => {
        expect(isPrivateAddress(address)).toBe(true);
    });

    it('allows a public address', () => {
        expect(isPrivateAddress('8.8.8.8')).toBe(false);
    });
});
