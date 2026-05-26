import { createMarketOpenDataSource } from './market-open-source';

const source = createMarketOpenDataSource({
    envPrefix: 'UK',
    logLabel: 'lib/slides/data/uk-market-open.ts',
    marketName: 'UK Market',
    regionLabel: 'London index board / ETF proxy',
    previewLabel: 'London index board preview',
    timezone: 'Europe/London',
    open: { hour: 8, minute: 0 },
    close: { hour: 16, minute: 30 },
    instruments: [
        {
            id: 'ftse100',
            label: 'FTSE 100',
            primary: ['UKX', 'FTSE', 'FTSE100'],
            proxies: ['ISF', 'VUKE'],
            stooq: [
                { symbol: 'ISF.UK', proxy: true },
                { symbol: 'VUKE.UK', proxy: true },
            ],
            demo: {
                symbol: 'UKX',
                proxySymbol: 'ISF',
                price: 8342.2,
                change: 28.4,
                changePercent: 0.34,
            },
        },
        {
            id: 'ftse250',
            label: 'FTSE 250',
            primary: ['MCX', 'FTSE250'],
            proxies: ['MIDD'],
            stooq: [{ symbol: 'MIDD.UK', proxy: true }],
            demo: {
                symbol: 'MCX',
                proxySymbol: 'MIDD',
                price: 20680.7,
                change: -42.5,
                changePercent: -0.21,
            },
        },
        {
            id: 'aim100',
            label: 'AIM 100',
            primary: ['AIM100', 'AIM1'],
            proxies: ['AIM'],
            stooq: [{ symbol: 'ISF.UK', proxy: true }],
            demo: {
                symbol: 'AIM100',
                proxySymbol: 'AIM',
                price: 3725.8,
                change: 11.2,
                changePercent: 0.3,
            },
        },
        {
            id: 'gbpusd',
            label: 'GBP/USD',
            primary: ['GBPUSD', 'GBP/USD'],
            proxies: ['FXB'],
            stooq: [{ symbol: 'GBPUSD' }, { symbol: 'FXB.US', proxy: true }],
            demo: {
                symbol: 'GBP/USD',
                proxySymbol: 'FXB',
                price: 1.276,
                change: 0.003,
                changePercent: 0.24,
            },
        },
    ],
});

export const getUkMarketOpenData = source.getData;
export const __resetUkMarketOpenCacheForTests = source.reset;
