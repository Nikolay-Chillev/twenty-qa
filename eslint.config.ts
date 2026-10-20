import eslint from '@eslint/js';
import playwright from 'eslint-plugin-playwright';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores([
    'playwright-report/',
    'test-results/',
    'blob-report/',
    'allure-results/',
    'allure-report/',
    'allure-history/',
    // Plain JavaScript config, outside the TypeScript project the type-aware rules need.
    'allurerc.mjs',
  ]),
  eslint.configs.recommended,
  // Type-aware rules catch what Playwright cannot: it strips types without checking
  // them, and a missing await (no-floating-promises) is the most common test bug.
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['tests/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
  },
);
