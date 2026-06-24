import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'reports/**',
      'test-results/**',
      'playwright-report/**',
      'shared/api/schema.d.ts',
      'perf/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Playwright fixtures 常用空解构 `async ({}, use) => {}`，属正常用法。
      'no-empty-pattern': 'off',
    },
  },
);
