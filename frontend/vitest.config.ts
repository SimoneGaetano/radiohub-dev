import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Test del frontend (D4).
 *
 * - `jsdom` dà un DOM reale (con `localStorage`); quel che jsdom non implementa
 *   — riproduzione audio, `IntersectionObserver` — è stubbato una volta sola in
 *   `tests/setup.ts`, non test per test;
 * - la ricerca ha un debounce di 450 ms: i test usano i timer veri e `waitFor`,
 *   così verificano la pausa di digitazione e non una sua imitazione.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    /**
     * `e2e/` è escluso: sono test **Playwright** (`*.spec.ts`), che Vitest
     * raccoglierebbe per via del nome ma non può eseguire — richiedono un browser
     * e la stack avviata. L'esclusione è esplicita perché la forma del nome è la
     * stessa dei test di React Testing Library.
     */
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
