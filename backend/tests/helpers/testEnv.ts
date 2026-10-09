/**
 * Costanti condivise dai test.
 *
 * `SYNC_API_KEY` è iniettata da `vitest.config.ts` (`test.env`) perché
 * `src/config/env.ts` valida le variabili d'ambiente al momento dell'import:
 * la chiave deve quindi esistere PRIMA che il modulo venga caricato.
 */
export const TEST_SYNC_API_KEY = 'test-sync-key-0123456789abcdef';
