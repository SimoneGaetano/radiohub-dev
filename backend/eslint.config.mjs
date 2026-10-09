// @ts-check
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * ESLint del backend (D3): flat config, la sola forma supportata da ESLint 10.
 *
 * Scelte:
 * - `js.configs.recommended` + `tseslint.configs.recommended`: le regole
 *   consigliate dalle due fonti, senza set sperimentali;
 * - `eslint-config-prettier` **per ultimo**: spegne le regole di formattazione
 *   che litigherebbero con Prettier, così i due strumenti non si contraddicono;
 * - `no-explicit-any` è un **errore**: è la richiesta esplicita di D3 ("nessun
 *   `any` non motivato"). Se serve davvero, si motiva con un commento e un
 *   `eslint-disable-next-line` mirato;
 * - `no-console` è un errore ovunque **tranne** in `src/utils/logger.ts`, che è
 *   l'unico punto in cui si deve scrivere sulla console;
 * - il client Prisma generato e il bundle vendorizzato sono esclusi: non sono
 *   codice nostro e non vanno toccati.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'src/generated/**', 'public/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        // `_arg` è il modo dichiarato per dire "non lo uso di proposito".
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['src/utils/logger.ts'],
    rules: {
      // Il logger è l'unico punto autorizzato a scrivere sulla console.
      'no-console': 'off',
    },
  },
);
