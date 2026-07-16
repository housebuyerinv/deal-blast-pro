import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'supabase/.temp/**',
      '_broken-tsx-backups/**',
      '**/*.bak*',
      '**/*.backup*',
      '**/*backup*.tsx',
      '**/*.phase1backup',
      '*.patch',
      '*.txt',
      '*.cjs',
      '*.ps1',
      '*.bat',
      '*.py',
      '*.js',
      'scripts/**',
      'artifacts/**',
      'buyer-match-restore/**',
      '.buyer-match-ui-restore/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'api/**/*.ts', 'supabase/functions/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
      'no-dupe-else-if': 'warn',
      'no-self-assign': 'warn',
      'no-constant-binary-expression': 'warn',
      'prefer-const': 'warn',
      'react/no-unescaped-entities': 'off',
    },
  },
)
