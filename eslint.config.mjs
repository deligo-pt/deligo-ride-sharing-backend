// ESLint v10 flat config (replaces the legacy .eslintrc.json).
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  // Only lint application source; build output, deps and tooling files are out of scope.
  { ignores: ['dist/**', 'node_modules/**', '**/*.js', '**/*.mjs'] },

  js.configs.recommended,

  // `flat/recommended-type-checked` = parser/plugin setup + eslint-recommended overrides
  // + @typescript-eslint/recommended + recommended-requiring-type-checking.
  ...tsPlugin.configs['flat/recommended-type-checked'].map((config) => ({
    ...config,
    files: ['src/**/*.ts'],
  })),

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      // Environment variables are validated once in src/config/env.ts and consumed through
      // `config` (src/config/index.ts). Raw reads elsewhere bypass that validation.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            "Don't read process.env directly — add the variable to src/config/env.ts and use `config` from 'src/config'.",
        },
      ],
    },
  },

  // The config layer itself (and scripts/, which is outside this lint scope) may read process.env.
  {
    files: ['src/config/**/*.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },

  // Must stay last: turns off stylistic rules that conflict with Prettier.
  prettier,
];
