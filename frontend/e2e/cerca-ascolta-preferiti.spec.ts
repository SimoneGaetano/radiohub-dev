import { expect, test } from '@playwright/test';
import {
  STATION,
  openApp,
  registerAndLogin,
  stubAudioTransport,
  stubCatalogue,
  uniqueEmail,
} from './helpers';

/**
 * X8 — il percorso principale dell'app: **cerca → ascolta → preferiti**.
 *
 * Ogni passo verifica uno stato **visibile** (l'etichetta del pulsante, lo stato
 * del player, il testo nella sezione preferiti) e l'ultimo controlla qualcosa di
 * più forte di una schermata: dopo un ricaricamento il preferito c'è ancora,
 * perché è salvato davvero sul server e non solo nello stato di React.
 *
 * Il test è uno solo di proposito: racconta una storia completa, e quando fallisce
 * si vede a quale passo si è fermata. Spezzettarlo in cinque test indipendenti
 * avrebbe richiesto cinque registrazioni di utenti diversi per verificare la
 * stessa cosa.
 */
test.describe('cerca → ascolta → preferiti', () => {
  test('un utente nuovo cerca, ascolta, salva e ritrova il preferito dopo il reload', async ({
    page,
  }) => {
    await stubCatalogue(page);
    await stubAudioTransport(page);
    await openApp(page);

    // 1. Account reale: la registrazione **apre subito la sessione**
    //    (bcrypt, JWT, tabella User).
    const email = uniqueEmail();
    await registerAndLogin(page, email);

    // 2. Ricerca: il testo digitato arriva al catalogo, dopo la pausa di digitazione.
    await page.getByLabel('Cerca una radio per nome').fill('jazz');
    await expect(
      page.getByRole('button', { name: `Ascolta ${STATION.name}` }),
    ).toBeVisible();

    // 3. Ascolto: la card diventa "in pausa", lo stato passa a LIVE e — prova più
    //    forte — il media element non risulta in pausa.
    await page.getByRole('button', { name: `Ascolta ${STATION.name}` }).click();
    await expect(
      page.getByRole('button', { name: `Metti in pausa ${STATION.name}` }),
    ).toBeVisible();
    await expect(page.getByText('LIVE').first()).toBeVisible();
    await expect
      .poll(async () =>
        page
          .locator('audio')
          .first()
          .evaluate((element) => !(element as HTMLAudioElement).paused),
      )
      .toBe(true);

    // 4. Preferiti: rotta protetta reale, quindi serve la sessione del punto 1.
    await page
      .getByRole('button', { name: `Aggiungi ${STATION.name} ai preferiti` })
      .click();
    // Dopo il click la stazione sta in **due** posti (griglia e sezione
    // preferiti): lo stesso pulsante esiste due volte, quindi si verifica lo
    // stato con `first()` e poi la presenza nella sezione dedicata.
    await expect(
      page
        .getByRole('button', {
          name: `Rimuovi ${STATION.name} dai preferiti`,
        })
        .first(),
    ).toBeVisible();
    await expect(
      page.locator('#preferiti').getByText(STATION.name).first(),
    ).toBeVisible();

    // 5. Persistenza: dopo il ricaricamento il preferito arriva dal server.
    await page.reload();
    await expect(
      page.locator('#preferiti').getByText(STATION.name).first(),
    ).toBeVisible();
  });
});
