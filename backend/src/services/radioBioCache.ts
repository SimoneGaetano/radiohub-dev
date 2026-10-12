import { createHash } from 'node:crypto';
import { env } from '../config/env';
import { redis } from '../redis/client';
import { logger } from '../utils/logger';

/**
 * Cache Redis della bio AI di una stazione (bonus "Info AI").
 *
 * La bio **non dipende dall'utente**: è la stessa per tutti, quindi si può
 * salvare una volta e riusare. Prima di questa cache ogni apertura del pannello
 * richiamava il modello — una chiamata a pagamento ogni volta, per lo stesso
 * testo.
 *
 * La chiave include anche un'impronta dei metadati usati per costruire la bio
 * (nome, paese, tag): se la stazione cambia nome o generi, il testo già in cache
 * — costruito su dati diversi — non viene riusato.
 *
 * Ogni errore degrada a "nessuna cache": si registra un avviso e si richiama il
 * provider, mai un errore verso il client (stessa filosofia della cache B3 e del
 * rate limiter: Redis giù peggiora il servizio, non lo spegne).
 */

interface RadioBioKeyInput {
  radioId: string;
  radioName: string;
  country?: string;
  tags?: string[];
}

/** Chiave deterministica della cache, per stazione e per i suoi metadati. */
export function buildRadioBioKey(input: RadioBioKeyInput): string {
  const fingerprint = createHash('sha256')
    .update(
      [input.radioName, input.country ?? '', (input.tags ?? []).join(',')].join(
        '|',
      ),
    )
    .digest('hex')
    .slice(0, 16);
  return `radio:bio:${input.radioId}:${fingerprint}`;
}

/** Lettura: `null` quando manca, quando Redis non risponde o se il valore è vuoto. */
export async function readRadioBio(key: string): Promise<string | null> {
  try {
    const value = await redis.get(key);
    return value && value.length > 0 ? value : null;
  } catch (error) {
    logger.warn('Radio bio cache read failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Scrittura con TTL (`RADIO_INFO_CACHE_TTL_SECONDS`); non lancia mai. */
export async function writeRadioBio(key: string, bio: string): Promise<void> {
  try {
    await redis.set(key, bio, 'EX', env.RADIO_INFO_CACHE_TTL_SECONDS);
  } catch (error) {
    logger.warn('Radio bio cache write failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
