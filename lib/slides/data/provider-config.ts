export type DataProviderConfig = {
    baseUrl: string;
    apiKey: string;
};

export function getDataProviderConfig(): DataProviderConfig | null {
    const baseUrl = process.env.DATA_PROVIDER_API_URL?.trim().replace(/\/$/, '');

    if (!baseUrl) {
        return null;
    }

    return {
        baseUrl,
        apiKey:
            process.env.DATA_PROVIDER_API_KEY ??
            process.env.NEXT_PUBLIC_DATA_PROVIDER_API_KEY ??
            '',
    };
}
