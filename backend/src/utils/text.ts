/**
 * Utilità di testo condivise da ricerca in linguaggio naturale (X3) e domande
 * sulle notizie (X4): normalizzazione italiana e difesa del prompt.
 *
 * Stanno qui e non dentro un servizio perché servono a due funzioni diverse con
 * gli stessi requisiti: confrontare testo italiano e incapsulare in modo sicuro
 * quello scritto dall'utente.
 */

/** Delimitano il testo dell'utente dentro i prompt (difesa da prompt injection). */
export const USER_TEXT_OPEN = '<<<TESTO_UTENTE';
export const USER_TEXT_CLOSE = 'TESTO_UTENTE>>>';

/** Minuscolo, senza accenti e con spazi compattati: la forma su cui si confronta. */
export function normalizeForSearch(raw: string): string {
  return (
    raw
      .toLowerCase()
      .normalize('NFD')
      // Rimuove i segni diacritici: "elettronica" e "elettronica" coincidono.
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Ripulisce il testo dell'utente dai marcatori dei delimitatori. */
export function sanitizeUserText(raw: string): string {
  return raw
    .split(USER_TEXT_OPEN)
    .join(' ')
    .split(USER_TEXT_CLOSE)
    .join(' ')
    .trim();
}

/**
 * Termini utili al confronto, per un indice o una domanda.
 *
 * **Nessuna lista di stop word**, di proposito: nel punteggio TF-IDF un termine
 * presente in *tutti* i documenti aggiunge la stessa quantità a ogni documento,
 * quindi non può cambiarne l'ordine — l'`idf` lo neutralizza da solo. Tenerne una
 * seconda copia sarebbe codice in più senza effetto sui risultati.
 */
export function tokenizeForIndex(text: string): string[] {
  return normalizeForSearch(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
}
