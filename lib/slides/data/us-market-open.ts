import { createMarketOpenDataSource } from './market-open-source';

const source = createMarketOpenDataSource({
    envPrefix: 'US',
    logLabel: 'lib/slides/data/us-market-open.ts',
    marketName: 'US Market',
    regionLabel: 'US index futures / ETF proxy',
    previewLabel: 'US index board preview',
    timezone: 'America/New_York',
    open: { hour: 9, minute: 30 },
    close: { hour: 16, minute: 0 },
    instruments: [
        {
            id: 'sp500',
            label: 'S&P 500',
            primary: ['ES', '/ES', 'ES1', 'SPX'],
            proxies: ['SPY'],
            stooq: [{ symbol: 'SPY.US', proxy: true }],
            demo: {
                symbol: 'ES',
                proxySymbol: 'SPY',
                price: 6280.25,
                change: 12.4,
                changePercent: 0.2,
            },
        },
        {
            id: 'nasdaq100',
            label: 'Nasdaq 100',
            primary: ['NQ', '/NQ', 'NQ1', 'NDX', 'IXIC'],
            proxies: ['QQQ'],
            stooq: [{ symbol: 'QQQ.US', proxy: true }],
            demo: {
                symbol: 'NQ',
                proxySymbol: 'QQQ',
                price: 22890.75,
                change: -18.2,
                changePercent: -0.08,
            },
        },
        {
            id: 'dow',
            label: 'Dow',
            primary: ['YM', '/YM', 'YM1', 'DJI', 'DJIA'],
            proxies: ['DIA'],
            stooq: [{ symbol: 'DIA.US', proxy: true }],
            demo: {
                symbol: 'YM',
                proxySymbol: 'DIA',
                price: 46210,
                change: 94.1,
                changePercent: 0.2,
            },
        },
        {
            id: 'russell2000',
            label: 'Russell 2000',
            primary: ['RTY', '/RTY', 'RTY1', 'RUT'],
            proxies: ['IWM'],
            stooq: [{ symbol: 'IWM.US', proxy: true }],
            demo: {
                symbol: 'RTY',
                proxySymbol: 'IWM',
                price: 2264.5,
                change: 8.7,
                changePercent: 0.39,
            },
        },
    ],
});

export const getUsMarketOpenData = source.getData;
export const __resetUsMarketOpenCacheForTests = source.reset;
