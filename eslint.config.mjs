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
    },
  },

  // Must stay last: turns off stylistic rules that conflict with Prettier.
  prettier,
];
