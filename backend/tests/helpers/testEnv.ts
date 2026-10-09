/**
 * Costanti condivise dai test.
 *
 * `SYNC_API_KEY` è iniettata da `vitest.config.ts` (`test.env`) perché
 * `src/config/env.ts` valida le variabili d'ambiente al momento dell'import:
 * la chiave deve quindi esistere PRIMA che il modulo venga caricato.
 */
export const TEST_SYNC_API_KEY = 'test-sync-key-0123456789abcdef';

/**
 * Token fittizio per FM-World (B1): serve a far tentare il provider primario
 * nei test. La forma della risposta di FM-World non è verificabile — il token
 * della traccia risponde 403 — quindi i test unitari usano `fetch` stubbata.
 */
export const TEST_FM_WORLD_TOKEN = 'test-fm-world-token';
