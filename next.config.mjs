import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

// getCloudflareContext() loads Wrangler dynamically when standalone Node uses
// the persisted local D1/R2/KV bindings. Dynamic imports are invisible to
// Next.js output tracing, so production releases must include this runtime
// closure explicitly instead of resolving it from the source worktree.
const localBindingRuntimePackages = [
    '@cloudflare/kv-asset-handler',
    '@cloudflare/unenv-preset',
    '@cloudflare/workerd-linux-arm64',
    '@cspotcode/source-map-support',
    '@esbuild/linux-arm64',
    '@img/colour',
    '@img/sharp-libvips-linux-arm64',
    '@img/sharp-libvips-linuxmusl-arm64',
    '@img/sharp-linux-arm64',
    '@img/sharp-linuxmusl-arm64',
    '@jridgewell/resolve-uri',
    '@jridgewell/sourcemap-codec',
    '@jridgewell/trace-mapping',
    '@poppinss/colors',
    '@poppinss/dumper',
    '@poppinss/exception',
    '@sindresorhus/is',
    '@speed-highlight/core',
    'blake3-wasm',
    'cookie',
    'detect-libc',
    'error-stack-parser-es',
    'esbuild',
    'has-flag',
    'kleur',
    'miniflare',
    'path-to-regexp',
    'pathe',
    'semver',
    'sharp',
    'supports-color',
    'undici',
    'unenv',
    'workerd',
    'wrangler',
    'ws',
    'youch',
    'youch-core',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    outputFileTracingIncludes: {
        '*': localBindingRuntimePackages.map((packageName) => `./node_modules/${packageName}/**/*`),
    },
    poweredByHeader: false,
    experimental: {
        middlewareClientMaxBodySize: '100mb',
    },
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: '**.supabase.co' },
            { protocol: 'http', hostname: '127.0.0.1' },
            { protocol: 'http', hostname: 'localhost' },
        ],
    },
};

export default withNextIntl(nextConfig);
