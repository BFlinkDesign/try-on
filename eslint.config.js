// @ts-check
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'public/**', 'reports/**', 'test-results/**', '.stryker-tmp/**', '.mutants/**', '.payload/**', 'private/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  { files: ['src/**/*.js'], languageOptions: { globals: { ...globals.browser, __APP_VERSION__: 'readonly' } } },
  { files: ['scripts/**/*.mjs', '*.js', '*.mjs', 'tests/unit/**/*.js'], languageOptions: { globals: { ...globals.node } } },
  // End-to-end specs and browser-driving scripts run in Node, but the callbacks they pass to page.evaluate run in the page.
  { files: ['tests/e2e/**/*.js', 'scripts/compare-screens.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
