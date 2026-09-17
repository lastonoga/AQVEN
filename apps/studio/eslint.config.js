import js from '@eslint/js'
import globals from 'globals'
import noComments from 'eslint-plugin-no-comments'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const modelSdkMessage = 'Model SDK imports live only in @aqven/llm.'
const spaMessage = 'Studio is a Vite SPA (ADR-0024).'

const bannedPaths = [
  { name: 'ai', message: modelSdkMessage },
  { name: 'next', message: spaMessage },
]
const modelSdkOnly = { group: ['@ai-sdk/*', '@openrouter/*'], message: modelSdkMessage }
const noNext = { group: ['next/*'], message: spaMessage }
const featureIndexOnly = { group: ['@/features/*/*'], message: 'Import features through their index.ts' }
const loaderDataOnly = { group: ['@/data/*', '!@/data/ids'], message: 'Components and features read data through loaders' }
const noMockData = { group: ['@/mocks/*'], message: 'Screens read data through loaders' }

const restrictedImports = (...patterns) => [
  'error',
  { paths: bannedPaths, patterns: [modelSdkOnly, noNext, featureIndexOnly, ...patterns] },
]

export default defineConfig([
  globalIgnores([
    'dist',
    'public/mockServiceWorker.js',
    'src/routeTree.gen.ts',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    plugins: { 'no-comments': noComments },
    rules: {
      'no-comments/disallowComments': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      'no-restricted-syntax': ['error', 'SwitchStatement'],
      'no-restricted-imports': restrictedImports(),
    },
  },
  {
    files: ['src/components/**', 'src/features/**'],
    rules: {
      'no-restricted-imports': restrictedImports(loaderDataOnly, noMockData),
    },
  },
  {
    files: ['src/components/**/*.test.{ts,tsx}', 'src/features/**/*.test.{ts,tsx}', 'src/features/**/test-support.ts'],
    rules: {
      'no-restricted-imports': restrictedImports(loaderDataOnly),
    },
  },
  {
    files: ['src/data/ids.ts', 'src/data/http/client.ts'],
    rules: {
      '@typescript-eslint/consistent-type-assertions': 'off',
    },
  },
  {
    files: ['src/routes/**'],
    rules: {
      '@typescript-eslint/only-throw-error': [
        'error',
        { allow: [{ from: 'package', package: '@tanstack/router-core', name: ['NotFoundError', 'Redirect'] }] },
      ],
    },
  },
  {
    files: ['src/routes/**', 'src/components/ui/**', 'src/components/studio/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
