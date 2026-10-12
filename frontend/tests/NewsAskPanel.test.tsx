import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewsAskPanel } from '../src/components/NewsAskPanel';
import { api } from '../src/services/api';
import type { NewsAnswer } from '../src/types';
import { axiosResponse, renderApp } from './helpers/renderApp';

/**
 * X4 — "Chiedi alle notizie".
 *
 * Il test intercetta l'HTTP e verifica cosa viene chiesto e cosa viene mostrato:
 * la risposta, le fonti, e la distinzione fra fonte **citata** e fonte di solo
 * contesto (le fonti non citate restano visibili ma non marcate).
 */
vi.mock('../src/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/api')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

const post = vi.mocked(api.post);

const ANSWER: NewsAnswer = {
  question: 'cosa si dice del festival del rock?',
  answer: 'Il festival del rock torna in città per tre giorni.',
  sources: [
    {
      postId: 'p-2',
      title: 'Il festival del rock torna in città',
      publishedAt: '2026-10-02T08:00:00.000Z',
      score: 0.42,
      excerpt: 'Tre giorni di concerti rock e metal nel centro storico.',
      matchedTerms: ['rock'],
    },
    {
      postId: 'p-3',
      title: 'Nuove regole per lo streaming',
      publishedAt: '2026-10-03T08:00:00.000Z',
      score: 0.11,
      excerpt: 'La norma riguarda anche il jazz registrato dal vivo.',
      matchedTerms: ['streaming'],
    },
  ],
  citationIds: ['p-2'],
  source: 'ai',
  provider: 'gemini',
  fallbackReason: null,
};

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue(axiosResponse({ data: ANSWER }));
});

describe('NewsAskPanel (X4)', () => {
  it('chiede al backend e mostra risposta, fonte citata e fonte di contesto', async () => {
    const user = userEvent.setup();
    renderApp(<NewsAskPanel />);

    await user.type(
      screen.getByLabelText('Domanda sulle notizie'),
      'cosa si dice del festival del rock?',
    );
    await user.click(screen.getByRole('button', { name: 'Chiedi' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/posts/ask', {
        question: 'cosa si dice del festival del rock?',
      }),
    );

    expect(
      await screen.findByText(
        'Il festival del rock torna in città per tre giorni.',
      ),
    ).toBeInTheDocument();
    // Entrambe le fonti sono mostrate...
    expect(
      screen.getByText('Il festival del rock torna in città'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Nuove regole per lo streaming'),
    ).toBeInTheDocument();
    // ...ma solo quella usata dal modello è marcata come citata.
    expect(screen.getAllByText('citata')).toHaveLength(1);
  });

  it('senza sintesi mostra i passaggi e lo dichiara', async () => {
    post.mockResolvedValue(
      axiosResponse({
        data: {
          ...ANSWER,
          answer: null,
          source: 'retrieval',
          provider: null,
          fallbackReason: 'no-provider',
        },
      }),
    );

    const user = userEvent.setup();
    renderApp(<NewsAskPanel />);

    await user.type(
      screen.getByLabelText('Domanda sulle notizie'),
      'cosa si dice del rock?',
    );
    await user.click(screen.getByRole('button', { name: 'Chiedi' }));

    expect(
      await screen.findByText(/ecco i passaggi più pertinenti/),
    ).toBeInTheDocument();
    expect(screen.getAllByText('citata')).toHaveLength(1);
  });

  it('tiene il pulsante disabilitato finché la domanda è troppo corta', () => {
    renderApp(<NewsAskPanel />);

    expect(screen.getByRole('button', { name: 'Chiedi' })).toBeDisabled();
  });

  it('usa un campo `type="search"`: la ✕ che lo azzera è quella del browser', () => {
    renderApp(<NewsAskPanel />);

    // Stesso campo della ricerca radio: la ✕ di azzeramento arriva dal browser.
    expect(screen.getByLabelText('Domanda sulle notizie')).toHaveAttribute(
      'type',
      'search',
    );
  });

  it('mostra l’errore quando la richiesta fallisce', async () => {
    post.mockRejectedValue(new Error('rete giù'));

    const user = userEvent.setup();
    renderApp(<NewsAskPanel />);

    await user.type(
      screen.getByLabelText('Domanda sulle notizie'),
      'cosa si dice del rock?',
    );
    await user.click(screen.getByRole('button', { name: 'Chiedi' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('rete giù');
  });
});
