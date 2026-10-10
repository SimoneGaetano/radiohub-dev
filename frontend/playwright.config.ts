import { defineConfig, devices } from '@playwright/test';

/**
 * X8 — configurazione dei test end-to-end.
 *
 * I test girano contro lo **stack reale** (`docker compose up`: nginx, backend,
 * Postgres, Redis) servito su `http://localhost:8080`, non contro un dev server:
 * è la stessa cosa che consegno, quindi è quella che verifico. L'URL si può
 * cambiare con `E2E_BASE_URL`.
 *
 * Non c'è nessun `webServer`: avviare lo stack (e aspettarne gli healthcheck) è
 * compito di chi lancia i test — in locale `docker compose up -d --wait`, in CI
 * un passo dedicato. Playwright che fa `docker compose up` dentro il proprio
 * `globalSetup` renderebbe i test difficili da lanciare a mano proprio quando
 * servono, cioè quando qualcosa non va.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './e2e',

  /**
   * File in sequenza e un solo worker: i test E2E condividono lo stack e le
   * quote di rate limiting. Un E2E che dipende dall'ordine non è un test, ma
   * parallelism sullo stesso backend significa interferenze difficili da
   * distinguere da un difetto.
   */
  fullyParallel: false,
  workers: 1,

  /** Un `.only` dimenticato non deve far passare una suite incompleta in CI. */
  forbidOnly: Boolean(process.env.CI),

  /** Un ritentativo in CI: la prima esecuzione può incontrare un asset lento. */
  retries: process.env.CI ? 1 : 0,

  timeout: 30_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    /**
     * `--autoplay-policy`: senza questa opzione Chromium può bloccare l'avvio del
     * flusso e il test fallirebbe per una policy del browser, non per il codice.
     */
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
