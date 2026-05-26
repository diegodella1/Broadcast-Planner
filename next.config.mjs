import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    poweredByHeader: false,
    experimental: {
        middlewareClientMaxBodySize: '100mb',
    },
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: '**.vimeocdn.com' },
            { protocol: 'https', hostname: '**.supabase.co' },
            { protocol: 'http', hostname: '127.0.0.1' },
            { protocol: 'http', hostname: 'localhost' },
        ],
    },
};

export default withNextIntl(nextConfig);
