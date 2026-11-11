import babelParser from '@babel/eslint-parser';
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

const tsParserOptions = (isTSX) => ({
  requireConfigFile: false,
  ecmaVersion: 2024,
  sourceType: 'module',
  babelOptions: {
    presets: [
      ['@babel/preset-typescript'],
      ...(isTSX ? [['@babel/preset-react', { runtime: 'automatic' }]] : []),
    ],
  },
});

const tsRules = {
  'react-hooks/rules-of-hooks': 'error',
  'react-hooks/exhaustive-deps': 'warn',
  'no-undef': 'off',
  // Babel no resuelve imports usados solo como tipo; tsc sigue siendo la puerta de tipos.
  'no-unused-vars': 'off',
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-control-regex': 'off',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      'release/**',
      'coverage/**',
      'build/**',
      'artifacts/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: babelParser,
      parserOptions: tsParserOptions(false),
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: tsRules,
  },
  {
    files: ['**/*.tsx'],
    languageOptions: {
      parser: babelParser,
      parserOptions: tsParserOptions(true),
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: tsRules,
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'commonjs', globals: globals.node },
    rules: {
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
    rules: {
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'preserve-caught-error': 'off',
    },
  },
];
