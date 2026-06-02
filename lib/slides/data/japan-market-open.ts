import { createMarketOpenDataSource } from './market-open-source';

const source = createMarketOpenDataSource({
    envPrefix: 'JAPAN',
    logLabel: 'lib/slides/data/japan-market-open.ts',
    marketName: 'Japan Market',
    regionLabel: '',
    previewLabel: '',
    timezone: 'Asia/Tokyo',
    open: { hour: 9, minute: 0 },
    close: { hour: 15, minute: 30 },
    instruments: [
        {
            id: 'nikkei225',
            label: 'Nikkei 225',
            primary: ['NKY', 'NI225', 'NIKKEI', 'N225'],
            proxies: ['1321', 'EWJ'],
            stooq: [
                { symbol: '1321.JP', proxy: true },
                { symbol: 'EWJ.US', proxy: true },
            ],
            demo: {
                symbol: 'N225',
                proxySymbol: '1321',
                price: 39280.5,
                change: 184.2,
                changePercent: 0.47,
            },
        },
        {
            id: 'topix',
            label: 'TOPIX',
            primary: ['TOPIX', 'TPX'],
            proxies: ['1306'],
            stooq: [
                { symbol: '1306.JP', proxy: true },
                { symbol: 'EWJ.US', proxy: true },
            ],
            demo: {
                symbol: 'TOPIX',
                proxySymbol: '1306',
                price: 2764.2,
                change: -6.4,
                changePercent: -0.23,
            },
        },
        {
            id: 'mothers',
            label: 'Growth 250',
            primary: ['MOTHERS', 'GROWTH250', 'TSEGR'],
            proxies: ['2516'],
            stooq: [
                { symbol: '2516.JP', proxy: true },
                { symbol: 'EWJ.US', proxy: true },
            ],
            demo: {
                symbol: 'GROWTH250',
                proxySymbol: '2516',
                price: 638.4,
                change: 3.8,
                changePercent: 0.6,
            },
        },
        {
            id: 'jpx400',
            label: 'JPX 400',
            primary: ['JPX400', 'JPXNK400'],
            proxies: ['1599'],
            stooq: [
                { symbol: '1599.JP', proxy: true },
                { symbol: 'EWJ.US', proxy: true },
            ],
            demo: {
                symbol: 'JPX400',
                proxySymbol: '1599',
                price: 25210.6,
                change: 88.5,
                changePercent: 0.35,
            },
        },
    ],
});

export const getJapanMarketOpenData = source.getData;
export const __resetJapanMarketOpenCacheForTests = source.reset;
