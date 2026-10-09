import { env } from '../config/env';
import { logger } from '../utils/logger';

/** Hard timeout for the radio-info provider call (kept short: the drawer waits). */
const RADIO_INFO_TIMEOUT_MS = 10_000;

/** Pause before retrying a transient upstream failure (429/503). */
const RADIO_INFO_RETRY_DELAY_MS = 1_200;

/** Optional station context forwarded to real providers for richer bios. */
export interface RadioInfoContext {
  /** Country of the station, when known. */
  country?: string;
  /** Genres / tags of the station, when known. */
  tags?: string[];
}

/** Contract for a radio-info generator. Implementations must never throw on
 * invalid input: they return null instead and let callers fall through to the
 * safe fallback builder. */
export interface RadioInfoSource {
  readonly name: string;
  generateRadioInfo(
    radioId: string,
    radioName: string,
    context?: RadioInfoContext,
  ): Promise<string | null>;
}

/**
 * Safe, dynamic fallback sentence built from the station name and country.
 * Used whenever no real API key is configured or the provider fails — it never
 * reuses a fixed template: the wording adapts to the data actually provided.
 */
export function buildFallbackBio(
  radioName: string,
  country?: string,
): string {
  const name = radioName.trim() || 'Questa stazione';
  const origin = country && country.trim().length > 0 ? `di ${country.trim()}` : 'della rete';
  return (
    `${name} è una stazione radio ${origin} che accompagna le giornate con una ` +
    'selezione musicale fresca e variegata, tra successi del momento e classici ' +
    'senza tempo. Il suo target è eterogeneo — dal pubblico giovane a chi cerca ' +
    'semplicemente compagnia di qualità — e l’atmosfera dell’ascolto è sempre ' +
    'accogliente, ideale per lavorare, viaggiare o rilassarsi.'
  );
}

/**
 * Safe mock source: deterministic, offline text built from the station payload.
 * Used whenever no real API key is configured.
 */
export class MockRadioInfoSource implements RadioInfoSource {
  readonly name = 'mock';

  async generateRadioInfo(
    _radioId: string,
    radioName: string,
    context?: RadioInfoContext,
  ): Promise<string | null> {
    return buildFallbackBio(radioName, context?.country);
  }
}

/**
 * Real provider backed by the Gemini REST API.
 * `gemini-2.5-flash` is used explicitly: the `gemini-flash-latest` alias
 * answered 503 "high demand" while this model answered 200 consistently.
 * Only instantiated when `GEMINI_API_KEY` is configured; on any failure it
 * returns null and the caller falls through to the dynamic fallback.
 */
class GeminiRadioInfoSource implements RadioInfoSource {
  readonly name = 'gemini';
  private readonly model = 'gemini-2.5-flash';

  async generateRadioInfo(
    _radioId: string,
    radioName: string,
    context?: RadioInfoContext,
  ): Promise<string | null> {
    const country =
      context?.country && context.country.trim().length > 0
        ? context.country.trim()
        : 'non specificato';
    const tags =
      context?.tags && context.tags.length > 0
        ? context.tags.join(', ')
        : 'non specificati';

    const prompt =
      'Sei un esperto di musica e radio mondiale. Genera una biografia breve, ' +
      'accurata e coinvolgente (massimo 80 parole) per la stazione radio ' +
      `'${radioName}' (Paese: '${country}', Generi/Tag: '${tags}'). ` +
      'Descrivi il tipo di musica che trasmette, il suo target e l’atmosfera ' +
      'dell’ascolto. Rispondi direttamente con il testo in italiano senza preamboli.';

    try {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=` +
            env.GEMINI_API_KEY,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.6,
                maxOutputTokens: 600,
                // The 2.5 flash models spend part of the output budget on
                // internal reasoning: with it enabled the bio came back after
                // ~5s and truncated to a few words. Disabling it makes the call
                // fast and gives the whole budget to the answer.
                thinkingConfig: { thinkingBudget: 0 },
              },
            }),
            signal: AbortSignal.timeout(RADIO_INFO_TIMEOUT_MS),
          },
        );

        if (response.ok) {
          const data = (await response.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          return text && text.length > 0 ? text : null;
        }

        logger.warn('Gemini radio-info request failed', {
          status: response.status,
          statusText: response.statusText,
          attempt,
        });

        // Transient capacity errors are worth one retry; anything else is final.
        const retryable = response.status === 429 || response.status === 503;
        if (!retryable || attempt === 2) {
          return null;
        }
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), RADIO_INFO_RETRY_DELAY_MS);
        });
      }
      return null;
    } catch (error) {
      logger.warn('Gemini radio-info call threw; falling back', {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

/** Real provider: calls the external OpenAI API when its key is configured. */
class OpenAIRadioInfoSource implements RadioInfoSource {
  readonly name = 'openai';

  async generateRadioInfo(
    radioId: string,
    radioName: string,
    context?: RadioInfoContext,
  ): Promise<string | null> {
    const prompt =
      'Write a short professional bio (max 400 chars) of the radio ' +
      `described by these fields: ${JSON.stringify({
        id: radioId,
        name: radioName,
        country: context?.country ?? 'unknown',
        tags: context?.tags ?? [],
      })}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.OPENAI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      choices?: [{ message?: { content?: string } }];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  }
}

export function createAiService(): RadioInfoSource {
  // GEMINI_API_KEY present → real Gemini call (primary provider).
  if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0) {
    return new GeminiRadioInfoSource();
  }
  // Otherwise fall back to OpenAI when its key is set.
  if (env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim().length > 0) {
    return new OpenAIRadioInfoSource();
  }
  // No API key configured → clean, dynamic fallback output.
  return new MockRadioInfoSource();
}
