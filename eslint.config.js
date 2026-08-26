export default [
  {
    ignores: ['dist/', 'node_modules/', '*.sqlite', 'backend-py/__pycache__/'],
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        browser: true,
        es2022: true,
        node: true,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'warn',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-template': 'warn',
    },
  },
  {
    files: ['backend/**/*.js'],
    languageOptions: {
      globals: { node: true, browser: false },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['frontend/**/*.js'],
    languageOptions: {
      globals: { browser: true, node: false },
    },
  },
  {
    files: ['**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: { vitest: true },
    },
  },
];
