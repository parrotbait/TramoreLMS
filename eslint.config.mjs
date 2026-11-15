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
        // Button feedback rule (CLAUDE.md). A button that submits a form must be a
        // SubmitButton, which shows a loading state. Only type="button" is allowed raw.
        files: ['src/**/*.tsx'],
        ignores: ['src/components/SubmitButton.tsx'],
        rules: {
            'no-restricted-syntax': ['error', {
                selector: 'JSXOpeningElement[name.name=\'button\']'
                    + ':not(:has(JSXAttribute[name.name=\'type\'][value.value=\'button\']))',
                message: 'Use <SubmitButton> from @/components/SubmitButton for buttons that submit a form. '
                    + 'A button with an onClick needs type="button" and its own visible feedback. See CLAUDE.md.',
            }],
        },
    },
    {
        files: ['**/__tests__/**', '**/*.test.ts'],
        rules: {
            '@typescript-eslint/no-non-null-assertion': 'off',
        },
    },
)
