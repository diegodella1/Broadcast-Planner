import { FlatCompat } from '@eslint/eslintrc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

export default [
    {
        ignores: [
            'node_modules/**',
            '.next/**',
            '.open-next/**',
            '.wrangler/**',
            'coverage/**',
            'messages/**',
            'supabase/migrations/**',
            'playwright-report/**',
            'test-results/**',
            'out/**',
            '*.tsbuildinfo',
            'next-env.d.ts',
        ],
    },
    ...compat.extends(
        'next/core-web-vitals',
        'next/typescript',
        'plugin:react-hooks/recommended',
        'plugin:jsx-a11y/recommended',
    ),
    {
        rules: {
            'import/order': 'off',
            '@next/next/no-img-element': 'off',
            curly: ['error', 'all'],
            'padding-line-between-statements': [
                'error',
                {
                    blankLine: 'always',
                    prev: '*',
                    next: ['if', 'for', 'while', 'return', 'switch', 'try'],
                },
            ],
        },
    },
];
