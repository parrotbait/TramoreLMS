// Created by Claude driven by Eddie Long on 2026-10-31.
//
// No Prettier. It collapses one-member-per-line unions and multi-line early
// returns, which the house style wants kept. @stylistic handles formatting.

import nextPlugin from '@next/eslint-plugin-next'
import stylistic from '@stylistic/eslint-plugin'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    {
        ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
    },
    ...tseslint.configs.strict,
    stylistic.configs.customize({
        indent: 4,
        quotes: 'single',
        semi: false,
        braceStyle: '1tbs',
    }),
    {
        plugins: {
            '@next/next': nextPlugin,
        },
        rules: {
            ...nextPlugin.configs.recommended.rules,
            'curly': ['error', 'all'],
            '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
            '@stylistic/max-len': ['warn', { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true }],
            '@stylistic/operator-linebreak': ['error', 'before', { overrides: { '=': 'after' } }],
            '@stylistic/member-delimiter-style': ['error', {
                multiline: { delimiter: 'none' },
                singleline: { delimiter: 'semi', requireLast: false },
            }],
            '@typescript-eslint/consistent-type-imports': 'error',
            // Splitting “Week {n}” across three lines hurts readability and gains nothing.
            '@stylistic/jsx-one-expression-per-line': 'off',
            '@stylistic/indent': ['error', 4, { SwitchCase: 1, offsetTernaryExpressions: false }],
        },
    },
    {
        files: ['**/__tests__/**', '**/*.test.ts'],
        rules: {
            '@typescript-eslint/no-non-null-assertion': 'off',
        },
    },
)
