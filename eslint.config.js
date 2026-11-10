import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'ios', 'android', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // Architecture guardrail: game rules in core/ must stay engine-free and testable.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['phaser', 'phaser/*'], message: 'core/ must not import Phaser.' },
            { group: ['@capacitor/*'], message: 'core/ must not import native plugins.' },
            {
              group: ['**/scenes/**', '**/services/**'],
              message: 'core/ must not depend on scenes or services.',
            },
          ],
        },
      ],
    },
  },
);
