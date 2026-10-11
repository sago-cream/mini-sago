import nextPlugin from '@next/eslint-plugin-next';
import { completeConfigBase } from 'eslint-config-complete';

export default [
    ...completeConfigBase,

    {
        ignores: [
            '.next/**',
            'dist/**',
            'out/**',
            'node_modules/**',
            'next-env.d.ts',
        ],
    },

    {
        plugins: {
            '@next/next': nextPlugin,
        },
        rules: {
            ...nextPlugin.configs.recommended.rules,
            ...nextPlugin.configs['core-web-vitals'].rules,
            '@stylistic/quotes': [
                'error',
                'single',
                {
                    avoidEscape: true,
                },
            ],
            'import-x/no-unassigned-import': [
                'error',
                {
                    allow: ['**/*.css'],
                },
            ],
        },
    },

    {
        files: ['src/**/*.{ts,tsx}'],
        rules: {
            // Public copy is Traditional Chinese; Next resolves bundler imports.
            'complete/require-ascii': 'off',
            'n/file-extension-in-import': 'off',
            'new-cap': ['error', { capIsNewExceptions: ['Nunito'] }],
        },
    },
    {
        files: ['src/app/**/*.tsx'],
        rules: {
            'complete/no-mutable-return': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            'n/file-extension-in-import': 'off',
            'import-x/no-default-export': 'off',
        },
    },
];
