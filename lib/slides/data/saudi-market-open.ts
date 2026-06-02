import { createMarketOpenDataSource } from './market-open-source';

const source = createMarketOpenDataSource({
    envPrefix: 'SAUDI',
    logLabel: 'lib/slides/data/saudi-market-open.ts',
    marketName: 'Saudi Market',
    regionLabel: '',
    previewLabel: '',
    timezone: 'Asia/Riyadh',
    open: { hour: 10, minute: 0 },
    close: { hour: 15, minute: 0 },
    instruments: [
        {
            id: 'tasi',
            label: 'Tadawul TASI',
            primary: ['TASI', 'SASEIDX'],
            proxies: ['KSA'],
            stooq: [{ symbol: 'KSA.US', proxy: true }],
            demo: {
                symbol: 'TASI',
                proxySymbol: 'KSA',
                price: 12184.2,
                change: 54.6,
                changePercent: 0.45,
            },
        },
        {
            id: 'mt30',
            label: 'MT30',
            primary: ['MT30', 'SASEMT30'],
            proxies: ['KSA'],
            stooq: [{ symbol: 'KSA.US', proxy: true }],
            demo: {
                symbol: 'MT30',
                proxySymbol: 'KSA',
                price: 1512.8,
                change: -4.1,
                changePercent: -0.27,
            },
        },
        {
            id: 'aramco',
            label: 'Saudi Aramco',
            primary: ['2222', '2222.SR', 'ARAMCO'],
            proxies: ['KSA'],
            stooq: [{ symbol: '2222.SA' }, { symbol: 'KSA.US', proxy: true }],
            demo: {
                symbol: '2222.SR',
                proxySymbol: 'KSA',
                price: 28.35,
                change: 0.12,
                changePercent: 0.42,
            },
        },
        {
            id: 'alrajhi',
            label: 'Al Rajhi Bank',
            primary: ['1120', '1120.SR', 'ALRAJHI'],
            proxies: ['KSA'],
            stooq: [{ symbol: '1120.SA' }, { symbol: 'KSA.US', proxy: true }],
            demo: {
                symbol: '1120.SR',
                proxySymbol: 'KSA',
                price: 87.4,
                change: 0.5,
                changePercent: 0.58,
            },
        },
    ],
});

export const getSaudiMarketOpenData = source.getData;
export const __resetSaudiMarketOpenCacheForTests = source.reset;
