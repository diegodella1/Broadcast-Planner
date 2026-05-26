/**
 * Placeholder for the real Reuters Connect API client.
 *
 * Wire this module up once OAuth2 `client_id`, `client_secret` and
 * `refresh_token` are provisioned. The fixtures provider in `lib/reuters.ts`
 * remains the default until then; flip the swap by setting
 * `REUTERS_PROVIDER=real` in the environment AND implementing this factory
 * against the contract exported from `./reuters`.
 *
 * Reference: https://developer.thomsonreuters.com (Reuters Connect API).
 */

import type { ReutersClient } from './reuters';

export function createRealReutersClient(): ReutersClient {
    throw new Error(
        'lib/reuters-real.ts: real Reuters Connect client is not implemented. ' +
            'Set REUTERS_PROVIDER=fixtures (default) until OAuth2 credentials are ' +
            'provisioned and lib/reuters-real.ts is wired against the Reuters ' +
            'Connect API. See lib/reuters.ts for the ReutersClient contract.',
    );
}
