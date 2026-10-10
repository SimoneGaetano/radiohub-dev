import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Client verso i modelli reali (Gemini, OpenAI).
 *
 * Esiste per non avere una terza copia della stessa chiamata HTTP: i riassunti
 * (A1–A3) e l'interpretazione della ricerca (X3) parlano con gli stessi due
 * servizi, con le stesse regole di timeout e retry, e le differenze stanno solo
 * nelle opzioni (`json`, `maxOutputTokens`, `temperature`) e nel prompt.
 *
 * Non lancia mai: in caso di problema restituisce `text: null` e il motivo, così
 * il chiamante può degradare (riassunto offline, interpretazione a regole)
 * invece di rispondere con un errore.
 */

export type ModelProvider = 'gemini' | 'openai';

export interface ModelCallOptions {
  /** Timeout della singola chiamata; default 10 s. */
  timeoutMs?: number;
  /** Tetto di token in uscita; default 512. */
  maxOutputTokens?: number;
  /** Chiede al modello una risposta JSON (Gemini: `responseMimeType`). */
  json?: boolean;
  /** Temperatura; default 0,3 — risposte il più possibile deterministiche. */
  temperature?: number;
}

export interface ModelCallResult {
  text: string | null;
  provider: ModelProvider | null;
  /** Motivo sintetico del fallimento (`no-provider`, `HTTP 429`, `timeout`). */
  reason: string | null;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_TOKENS = 512;
const RETRY_DELAY_MS = 1_200;

/**
 * Provider effettivo, dalla configurazione condivisa `SUMMARY_PROVIDER`:
 * `mock` non chiama nulla (offline e nei test), `auto` prende il primo provider
 * con una chiave configurata. Nessuna chiave → nessun provider.
 */
export function resolveModelProvider(): ModelProvider | null {
  const configured = env.SUMMARY_PROVIDER;

  if (configured === 'mock') {
    return null;
  }
  if (configured === 'gemini') {
    return env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 0
      ? 'gemini'
      : null;
  }
  if (configured === 'openai') {
    return env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 0
      ? 'openai'
      : null;
  }
  if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.length > 0) {
    return 'gemini';
  }
  if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 0) {
    return 'openai';
  }
  return null;
}

/** Modello usato: `SUMMARY_MODEL` se configurato, altrimenti il default. */
function modelFor(provider: ModelProvider): string {
  if (env.SUMMARY_MODEL && env.SUMMARY_MODEL.length > 0) {
    return env.SUMMARY_MODEL;
  }
  return provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini';
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

type ResolvedOptions = Required<
  Pick<ModelCallOptions, 'timeoutMs' | 'maxOutputTokens'>
> &
  ModelCallOptions;

interface CallOutcome {
  text: string | null;
  reason: string | null;
}

async function callGemini(
  prompt: string,
  options: ResolvedOptions,
): Promise<CallOutcome> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelFor('gemini')}:generateContent?key=${env.GEMINI_API_KEY ?? ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: options.temperature ?? 0.3,
              maxOutputTokens: options.maxOutputTokens,
              // I modelli 2.5 spendono parte del budget in ragionamento interno:
              // azzerarlo rende la risposta rapida e non tronca l'output.
              thinkingConfig: { thinkingBudget: 0 },
              ...(options.json ? { responseMimeType: 'application/json' } : {}),
            },
          }),
          signal: AbortSignal.timeout(options.timeoutMs),
        },
      );
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');

      logger.warn('Gemini call failed', {
        attempt,
        reason: timedOut ? 'timeout' : 'network',
        error: error instanceof Error ? error.message : String(error),
      });
      return { text: null, reason: timedOut ? 'timeout' : 'network' };
    }

    if (response.ok) {
      const data = (await response.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return text && text.length > 0
        ? { text, reason: null }
        : { text: null, reason: 'empty response' };
    }

    logger.warn('Gemini request failed', {
      status: response.status,
      statusText: response.statusText,
      attempt,
    });

    // Gli errori di capacità sono transitori e valgono un secondo tentativo.
    const retryable = response.status === 429 || response.status === 503;
    if (!retryable || attempt === 2) {
      return { text: null, reason: `HTTP ${response.status}` };
    }
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), RETRY_DELAY_MS);
    });
  }

  return { text: null, reason: 'HTTP 429' };
}

async function callOpenAi(
  prompt: string,
  options: ResolvedOptions,
): Promise<CallOutcome> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelFor('openai'),
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxOutputTokens,
        messages: [{ role: 'user', content: prompt }],
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    if (!response.ok) {
      logger.warn('OpenAI request failed', {
        status: response.status,
        statusText: response.statusText,
      });
      return { text: null, reason: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text && text.length > 0
      ? { text, reason: null }
      : { text: null, reason: 'empty response' };
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');

    logger.warn('OpenAI call failed', {
      reason: timedOut ? 'timeout' : 'network',
      error: error instanceof Error ? error.message : String(error),
    });
    return { text: null, reason: timedOut ? 'timeout' : 'network' };
  }
}

/**
 * Chiama il provider configurato e restituisce il testo.
 * Senza provider (o con `SUMMARY_PROVIDER=mock`) risponde `no-provider`: è il
 * segnale con cui i chiamanti passano alla loro strada offline.
 */
export async function callModel(
  prompt: string,
  options: ModelCallOptions = {},
): Promise<ModelCallResult> {
  const provider = resolveModelProvider();
  if (!provider) {
    return { text: null, provider: null, reason: 'no-provider' };
  }

  const resolved: ResolvedOptions = {
    ...options,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
  };

  const outcome =
    provider === 'gemini'
      ? await callGemini(prompt, resolved)
      : await callOpenAi(prompt, resolved);

  return { text: outcome.text, provider, reason: outcome.reason };
}

/** Firma della chiamata al modello: iniettabile nei test (nessuna rete). */
export type ModelCallFn = typeof callModel;

/**
 * Estrae l'oggetto JSON dalla risposta del modello, che a volte lo incapsula in
 * un blocco di codice o lo accompagna con una frase. Restituisce `null` se non
 * c'è un JSON leggibile: chi chiama passa allora alla propria strada offline.
 */
export function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');

  if (start === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
