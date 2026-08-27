import { describe, expect, it } from 'vitest';

import { metadataFailureState } from './asset-metadata';

describe('metadataFailureState', () => {
    it('preserves ready asset and marks last valid metadata stale', () => {
        expect(
            metadataFailureState({
                metadataFailures: 0,
                metadataStatus: 'ready',
                status: 'ready',
            }),
        ).toEqual({
            failures: 1,
            metadataStatus: 'stale',
            status: 'ready',
        });
    });

    it('moves asset to review on third consecutive failure', () => {
        expect(
            metadataFailureState({
                metadataFailures: 2,
                metadataStatus: 'stale',
                status: 'ready',
            }),
        ).toEqual({
            failures: 3,
            metadataStatus: 'stale',
            status: 'needs_review',
        });
    });
});
