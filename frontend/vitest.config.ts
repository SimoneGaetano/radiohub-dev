import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

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
  },
});
