import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', '.idea/**']
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      'src/**/*.{js,ts}',
      'docker/**/*.{ts,mjs}',
      'performance/**/*.mjs',
      'tests/**/*.ts',
      '*.config.{js,mjs,ts}',
      '.prettierrc.js'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node
    }
  },
  {
    files: ['web/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser
    }
  },
  {
    files: ['tests/performance/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        __ENV: 'readonly'
      }
    }
  },
  {
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[raw=/[0-9]_[0-9]/]',
          message: 'Write numeric literals without separators.'
        }
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          reportUsedIgnorePattern: true
        }
      ]
    }
  },
  eslintConfigPrettier
);
