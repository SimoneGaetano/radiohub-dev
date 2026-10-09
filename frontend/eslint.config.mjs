// @ts-check
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * ESLint del frontend (D3): flat config, come richiede ESLint 10.
 *
 * Scelte:
 * - `js.configs.recommended` + `tseslint.configs.recommended` sui file TS/TSX;
 * - le due regole di `react-hooks` e quella di `react-refresh` sono dichiarate
 *   **a mano** invece di usare i config preconfezionati dei plugin: così il file
 *   non dipende dalla forma dei loro preset (cambia tra le major) e si vede
 *   esattamente cosa è attivo;
 * - `react-refresh/only-export-components` è un **warning** e non un errore: il
 *   progetto esporta di proposito costanti accanto ai componenti (`PILLS`,
 *   `PILL_QUERIES`), cosa che il fast refresh tollera ma che non vale un build
 *   rosso;
 * - `no-explicit-any` è un errore (richiesta esplicita di D3) e
 *   `eslint-config-prettier` chiude la lista, per non duplicare la formattazione.
 */
export default tseslint.config(
  {
    ignores: ['dist/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Il service worker gira in un contesto suo: `self`, `caches`, `fetch`.
    // Senza queste globali `js.configs.recommended` lo segnala come 14 errori
    // `no-undef`, che sarebbero tutti falsi positivi.
    files: ['public/sw.js'],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  eslintConfigPrettier,
);
