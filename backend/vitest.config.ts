import { defineConfig } from 'vitest/config';
import { TEST_SYNC_API_KEY } from './tests/helpers/testEnv';

export default defineConfig({
  test: {
    /**
     * I test di integrazione condividono risorse reali (tabella `Post` e la
     * chiave Redis `posts:list`): eseguirli in sequenza evita che un file
     * invalidi la cache o riscriva i post mentre un altro file li verifica.
     */
    fileParallelism: false,

    /**
     * `src/config/env.ts` legge `process.env` all'import (con `dotenv`, che non
     * sovrascrive valori già presenti): questa chiave abilita `POST /api/sync`
     * nei test, come in produzione con `SYNC_API_KEY` configurata.
     */
    env: {
      SYNC_API_KEY: TEST_SYNC_API_KEY,
      /**
       * I test devono essere deterministici e offline: il provider dei
       * riassunti è forzato al mock, anche se nel `.env` di sviluppo c'è una
       * chiave Gemini reale (che verrebbe chiamata davvero dalla rete).
       */
      SUMMARY_PROVIDER: 'mock',
      /**
       * X6 — quota alzate al massimo nei test: la suite fa centinaia di
       * richieste da `127.0.0.1`, quindi con le quote reali i test fallirebbero
       * con `429` per motivi che non stanno verificando. Le soglie vere (429
       * compreso) sono testate da `tests/rateLimit.test.ts`, che costruisce il
       * middleware con i propri valori.
       */
      RATE_LIMIT_API_MAX: '100000',
      RATE_LIMIT_AUTH_MAX: '100000',
      RATE_LIMIT_AI_MAX: '100000',
    },
  },
});
