import { expect, type Page } from '@playwright/test';

/**
 * X8 — supporto ai test end-to-end.
 *
 * L'app è quella **vera**: frontend da nginx, backend, Postgres, Redis,
 * autenticazione, preferiti e persistenza. Sono controllati solo i due punti che
 * dipendono dal mondo esterno, perché un test che si rompe perché una stazione
 * pubblica è offline non sta misurando il nostro codice:
 *
 * 1. il **catalogo radio** (`/api/radios*`) risponde con una stazione fissa;
 * 2. il **trasporto audio** (richieste di tipo `media`) riceve un WAV di
 *    silenzio, così il player arriva davvero allo stato "in onda" anche senza
 *    rete e senza dipendere da un flusso reale.
 */

/** Password dei test: lunghezza valida per la validazione del backend (≥ 8). */
export const PASSWORD = 'password-e2e-123';

/** Stazione controllata: URL `.mp3`, quindi riprodotta senza `hls.js`. */
export const STATION = {
  id: 'e2e-station-1',
  name: 'E2E Jazz FM',
  url: 'https://e2e.invalid/stream.mp3',
  favicon: '',
  country: 'Italy',
  countryCode: 'IT',
  language: 'italian',
  tags: ['jazz'],
  votes: 1,
  codec: 'MP3',
  bitrate: 128,
};

/**
 * WAV PCM mono 8 kHz con i campioni a zero: un file valido di silenzio.
 * Generarlo qui evita di versionare un file audio e rende esplicito che il
 * contenuto non conta — conta che il browser lo riproduca.
 */
function silentWav(seconds = 10): Buffer {
  const sampleRate = 8_000;
  const samples = sampleRate * seconds;
  const dataSize = samples * 2; // 16 bit per campione
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // dimensione del blocco fmt
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte al secondo
  buffer.writeUInt16LE(2, 32); // allineamento del blocco
  buffer.writeUInt16LE(16, 34); // bit per campione
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

/** Il catalogo: qualunque chiamata a `/api/radios*` restituisce la stazione fissa. */
export async function stubCatalogue(page: Page): Promise<void> {
  await page.route('**/api/radios**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Cache': 'MISS', 'X-Radio-Source': 'e2e-stub' },
      body: JSON.stringify({
        data: [STATION],
        meta: {
          query: 'jazz',
          limit: 20,
          page: 1,
          count: 1,
          source: 'e2e-stub',
        },
      }),
    });
  });
}

/** Il trasporto audio: ogni richiesta `media` diventa il WAV di silenzio. */
export async function stubAudioTransport(page: Page): Promise<void> {
  const wav = silentWav();

  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'media') {
      await route.fulfill({
        status: 200,
        contentType: 'audio/wav',
        body: wav,
      });
      return;
    }
    // Tutto il resto va alla rete vera (o agli handler registrati prima).
    await route.fallback();
  });
}

/** Email unica per esecuzione: la tabella `User` è reale e condivisa. */
export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** Apre l'app e attende che la prima schermata sia montata. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Cerca una radio' }),
  ).toBeVisible();
}

/**
 * Registra un account ed **entra subito**.
 *
 * La registrazione non emette un token (l'API restituisce l'utente), quindi è il
 * **frontend** che, dopo il `201`, fa il login con le stesse credenziali: la
 * modale si chiude da sola e compare il menu dell'account. Il test attraversa
 * questo percorso reale invece di aggirarlo.
 */
export async function registerAndLogin(
  page: Page,
  email: string,
): Promise<void> {
  const openAuth = page.getByRole('button', { name: 'Accedi / Registrati' });

  await openAuth.click();
  await page
    .getByRole('button', {
      name: 'Non hai un account? Registrati',
      exact: true,
    })
    .click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  // `exact` è necessario: senza, "Registrati" corrisponde anche alla voce
  // "Non hai un account? Registrati" e il click diventa ambiguo — l'ha
  // segnalato il primo giro di test.
  await page.getByRole('button', { name: 'Registrati', exact: true }).click();

  // Accesso immediato: la modale si chiude e compare il menu dell'account.
  await expect(
    page.getByRole('button', { name: `Menu utente di ${email}` }),
  ).toBeVisible();
}
