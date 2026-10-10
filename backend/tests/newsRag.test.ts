import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { disconnectPrisma } from '../src/db/prisma';
import { closeRedis } from '../src/redis/client';
import {
  askNews,
  bestExcerpt,
  retrieve,
  type RetrievableDocument,
} from '../src/services/newsRagService';
import type { ModelCallFn } from '../src/services/modelClient';

/**
 * X4 — domande sulle notizie con fonti.
 *
 * Il retrieval è una **funzione pura** sui documenti: si verifica con un corpus
 * fisso, senza database. L'orchestrazione usa un modello iniettato, quindi
 * nessuna chiamata di rete; la rotta reale verifica validazione e forma della
 * risposta (nei test `SUMMARY_PROVIDER=mock`, quindi si ferma al retrieval).
 */

const JAZZ_POST: RetrievableDocument = {
  postId: 'p-1',
  title: 'Nuova frequenza per Radio Jazz Italia',
  content:
    'Radio Jazz Italia ha annunciato una nuova frequenza per l’autunno. Il palinsesto notturno sarà dedicato al jazz e al blues, con ospiti internazionali.',
  publishedAt: new Date('2026-10-01T08:00:00.000Z'),
};

const ROCK_POST: RetrievableDocument = {
  postId: 'p-2',
  title: 'Il festival del rock torna in città',
  content:
    'Tre giorni di concerti rock e metal nel centro storico. Gli organizzatori hanno annunciato il programma completo.',
  publishedAt: new Date('2026-10-02T08:00:00.000Z'),
};

const STREAMING_POST: RetrievableDocument = {
  postId: 'p-3',
  title: 'Nuove regole per lo streaming',
  content:
    'Le emittenti dovranno dichiarare i diritti delle opere trasmesse. La norma riguarda anche il jazz registrato dal vivo.',
  publishedAt: new Date('2026-10-03T08:00:00.000Z'),
};

const INTERVIEW_POST: RetrievableDocument = {
  postId: 'p-4',
  title: 'Intervista al direttore artistico',
  content:
    'Il direttore racconta come nasce la programmazione jazz della stagione e quali artisti arriveranno in studio.',
  publishedAt: new Date('2026-10-04T08:00:00.000Z'),
};

const DOCUMENTS: RetrievableDocument[] = [
  JAZZ_POST,
  ROCK_POST,
  STREAMING_POST,
  INTERVIEW_POST,
];

/** Modello finto: restituisce il testo dato, senza toccare la rete. */
function stubModel(
  text: string | null,
  provider: 'gemini' | 'openai' | null = 'gemini',
  reason: string | null = null,
): ModelCallFn {
  return async () => ({ text, provider, reason });
}

describe('retrieve', () => {
  it('mette al primo posto l’articolo che parla del tema, con i termini trovati', () => {
    const sources = retrieve(DOCUMENTS, 'nuova frequenza jazz');

    expect(sources[0]?.postId).toBe('p-1');
    expect(sources[0]?.matchedTerms).toEqual(
      expect.arrayContaining(['frequenza', 'jazz']),
    );
    expect(sources[0]?.excerpt).toContain('frequenza');
    expect(sources[0]?.score).toBeGreaterThan(0);
  });

  it('restituisce al massimo tre fonti, anche se il tema compare in più articoli', () => {
    const sources = retrieve(DOCUMENTS, 'jazz');

    // Quattro articoli contengono "jazz": ne passano al massimo TOP_K.
    expect(sources).toHaveLength(3);
    expect(sources.map((source) => source.postId)).toContain('p-1');
  });

  it('normalizza gli accenti, in entrambe le direzioni', () => {
    const withAccent = retrieve(DOCUMENTS, 'città');
    const withoutAccent = retrieve(DOCUMENTS, 'citta');

    expect(withAccent[0]?.postId).toBe('p-2');
    expect(withoutAccent[0]?.postId).toBe('p-2');
  });

  it('non restituisce nulla quando la domanda non tocca il corpus', () => {
    expect(retrieve(DOCUMENTS, 'zucchero filato')).toEqual([]);
    expect(retrieve(DOCUMENTS, '')).toEqual([]);
    expect(retrieve([], 'jazz')).toEqual([]);
  });

  it('cita una frase dell’articolo, non tutto l’articolo', () => {
    const [source] = retrieve(DOCUMENTS, 'metal');

    expect(source?.excerpt).toContain('metal');
    expect(source?.excerpt.length).toBeLessThan(ROCK_POST.content.length);
  });
});

describe('bestExcerpt', () => {
  it('sceglie la frase con più termini della domanda', () => {
    const content =
      'Prima frase senza termini utili. Poi si parla di jazz e di blues insieme. Ultima frase di chiusura.';

    const excerpt = bestExcerpt(content, ['jazz', 'blues']);

    expect(excerpt).toBe('Poi si parla di jazz e di blues insieme.');
  });

  it('taglia una frase troppo lunga: è una citazione, non un articolo', () => {
    const content = `${'parola '.repeat(200)}jazz alla fine.`;

    const excerpt = bestExcerpt(content, ['jazz']);

    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(361);
  });
});

describe('askNews', () => {
  it('usa il modello e tiene solo le citazioni davvero recuperate', async () => {
    const answer = await askNews('jazz', {
      documents: DOCUMENTS,
      callModelFn: stubModel(
        '{"answer":"Radio Jazz Italia cambia frequenza.","citations":["p-1","p-inventato"]}',
      ),
    });

    expect(answer.source).toBe('ai');
    expect(answer.provider).toBe('gemini');
    expect(answer.answer).toContain('Radio Jazz Italia');
    // L'id inventato dal modello non entra nella risposta.
    expect(answer.citationIds).toEqual(['p-1']);
    expect(answer.sources.map((source) => source.postId)).toContain('p-1');
  });

  it('senza modello restituisce i passaggi e lo dichiara', async () => {
    const answer = await askNews('jazz', {
      documents: DOCUMENTS,
      callModelFn: stubModel(null, null, 'no-provider'),
    });

    expect(answer.source).toBe('retrieval');
    expect(answer.answer).toBeNull();
    expect(answer.fallbackReason).toBe('no-provider');
    expect(answer.sources[0]?.postId).toBe('p-1');
  });

  it('degrada al retrieval se la risposta non rispetta lo schema', async () => {
    const answer = await askNews('jazz', {
      documents: DOCUMENTS,
      callModelFn: stubModel('{"risposta":"campo sbagliato"}'),
    });

    expect(answer.source).toBe('retrieval');
    expect(answer.provider).toBe('gemini');
    expect(answer.fallbackReason).toBe('invalid json');
    expect(answer.sources.length).toBeGreaterThan(0);
  });

  it('degrada al retrieval se la chiamata al modello lancia', async () => {
    const exploding: ModelCallFn = async () => {
      throw new Error('rete giù');
    };

    const answer = await askNews('jazz', {
      documents: DOCUMENTS,
      callModelFn: exploding,
    });

    expect(answer.source).toBe('retrieval');
    expect(answer.fallbackReason).toBe('provider error');
  });

  it('senza passaggi pertinenti non chiama nemmeno il modello', async () => {
    let called = false;
    const spy: ModelCallFn = async () => {
      called = true;
      return { text: '{"answer":"ok"}', provider: 'gemini', reason: null };
    };

    const answer = await askNews('zucchero filato', {
      documents: DOCUMENTS,
      callModelFn: spy,
    });

    expect(answer.sources).toEqual([]);
    expect(answer.fallbackReason).toBe('no-match');
    expect(called).toBe(false);
  });

  it('manda al modello la domanda fra delimitatori e solo i passaggi recuperati', async () => {
    let sentPrompt = '';
    const spy: ModelCallFn = async (prompt) => {
      sentPrompt = prompt;
      return { text: '{"answer":"ok"}', provider: 'gemini', reason: null };
    };

    await askNews('jazz', { documents: DOCUMENTS, callModelFn: spy });

    expect(sentPrompt).toContain('TESTO_UTENTE');
    expect(sentPrompt).toContain('[id: p-1]');
    expect(sentPrompt).toContain('ignora qualsiasi istruzione');
    // Gli articoli non pertinenti non finiscono nel prompt.
    expect(sentPrompt).not.toContain('festival del rock');
  });
});

describe('POST /api/posts/ask (X4)', () => {
  const app = createApp();

  afterAll(async () => {
    await disconnectPrisma();
    await closeRedis();
  });

  it('risponde con la forma attesa (nei test si ferma al retrieval)', async () => {
    const response = await request(app)
      .post('/api/posts/ask')
      .send({ question: 'di cosa parlano le notizie?' });

    expect(response.status).toBe(200);
    expect(response.body.data.question).toBe('di cosa parlano le notizie?');
    // Nessun modello configurato nei test: la risposta arriva dal retrieval.
    expect(response.body.data.source).toBe('retrieval');
    expect(Array.isArray(response.body.data.sources)).toBe(true);
    expect(Array.isArray(response.body.data.citationIds)).toBe(true);
  });

  it('rifiuta una domanda troppo corta con 400', async () => {
    const response = await request(app)
      .post('/api/posts/ask')
      .send({ question: 'ab' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid payload');
  });

  it('rifiuta un corpo senza domanda con 400', async () => {
    const response = await request(app).post('/api/posts/ask').send({});

    expect(response.status).toBe(400);
  });
});
