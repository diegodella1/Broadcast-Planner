/**
 * Reuters playback client.
 *
 * Provider selection is gated by the `REUTERS_PROVIDER` environment variable:
 *
 *   REUTERS_PROVIDER=fixtures   (default) — returns the in-memory fixture
 *                                channels defined below. Suitable for local
 *                                development, tests and staging until OAuth2
 *                                credentials are provisioned.
 *
 *   REUTERS_PROVIDER=real       — dynamically imports `./reuters-real` which
 *                                wraps the Reuters Connect API. The real impl
 *                                currently throws with explicit guidance — see
 *                                `lib/reuters-real.ts` for the swap path.
 *
 * Stable contract — both fixture and real impls MUST honour `ReutersClient`.
 * Adding/removing methods is a breaking change for downstream consumers.
 */

export type ReutersChannel = {
    id: string;
    name: string;
    description?: string;
    thumbnailUrl?: string;
    hlsUrl: string;
    category?: 'news' | 'markets' | 'sports' | 'weather';
};

export type ReutersClient = {
    listLiveChannels(): Promise<ReutersChannel[]>;
    /** Refreshes the (potentially signed) HLS URL for a channel. */
    getChannelStreamUrl(channelId: string): Promise<string>;
};

export async function getReutersClient(): Promise<ReutersClient> {
    const provider = process.env.REUTERS_PROVIDER ?? 'fixtures';

    if (provider === 'real') {
        // Real impl lives in `lib/reuters-real.ts`. Swap path: implement that
        // module with the Reuters Connect API once OAuth2 credentials land.
        const { createRealReutersClient } = await import('./reuters-real');

        return createRealReutersClient();
    }

    return createFixturesReutersClient();
}

const FIXTURE_CHANNELS: readonly ReutersChannel[] = [
    {
        id: 'top-news-hd',
        name: 'Reuters Top News HD',
        description: '24/7 global breaking news feed.',
        hlsUrl: 'https://example.com/reuters/top-news-hd.m3u8',
        category: 'news',
    },
    {
        id: 'world-news-hd',
        name: 'Reuters World News HD',
        description: 'World news rotation.',
        hlsUrl: 'https://example.com/reuters/world-news-hd.m3u8',
        category: 'news',
    },
    {
        id: 'markets-hd',
        name: 'Reuters Markets HD',
        description: 'Live markets coverage.',
        hlsUrl: 'https://example.com/reuters/markets-hd.m3u8',
        category: 'markets',
    },
    {
        id: 'sports-hd',
        name: 'Reuters Sports HD',
        description: 'Sports highlights and live action.',
        hlsUrl: 'https://example.com/reuters/sports-hd.m3u8',
        category: 'sports',
    },
    {
        id: 'weather-hd',
        name: 'Reuters Weather HD',
        description: 'Live weather and global forecast.',
        hlsUrl: 'https://example.com/reuters/weather-hd.m3u8',
        category: 'weather',
    },
] as const;

function createFixturesReutersClient(): ReutersClient {
    return {
        async listLiveChannels() {
            return FIXTURE_CHANNELS.map((channel) => ({ ...channel }));
        },
        async getChannelStreamUrl(channelId: string) {
            const channel = FIXTURE_CHANNELS.find((c) => c.id === channelId);

            if (!channel) {
                throw new Error(`reuters: unknown channel ${channelId}`);
            }

            return channel.hlsUrl;
        },
    };
}
