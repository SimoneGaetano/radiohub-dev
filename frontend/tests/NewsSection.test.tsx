import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewsSection } from '../src/components/NewsSection';
import { api } from '../src/services/api';
import type { Post, PostsResponse } from '../src/types';
import { axiosResponse, renderApp } from './helpers/renderApp';

/**
 * F3 — sezione Notizie: il campo "Filtra per titolo" e la ✕ che lo azzera.
 *
 * Quella ✕ **non è un pulsante nostro**: è la stessa che il browser disegna da
 * sé su `type="search"`, identica alla ricerca radio. Il test la difende come
 * attributo, perché i due difetti da evitare sono opposti e simmetrici: il
 * **doppio** ✕ (uno nativo e uno costruito a mano accanto) e la ✕ **assente**
 * (un `type` che non la fa comparire).
 */
vi.mock('../src/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/api')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

const getPosts = vi.mocked(api.get);

const POST: Post = {
  id: 'p-1',
  externalId: 'ext-1',
  title: 'Il festival del rock torna in città',
  content: 'Tre giorni di concerti rock e metal nel centro storico.',
  publishedAt: '2026-10-02T08:00:00.000Z',
  summary: null,
  createdAt: '2026-10-02T08:05:00.000Z',
};

const RESPONSE: PostsResponse = { data: [POST] };

beforeEach(() => {
  getPosts.mockReset();
  getPosts.mockResolvedValue(axiosResponse(RESPONSE));
});

describe('NewsSection — filtro per titolo (F3)', () => {
  it('usa un campo `type="search"`: la ✕ che lo azzera è quella del browser', async () => {
    const user = userEvent.setup();
    renderApp(<NewsSection />);

    const input = screen.getByLabelText('Filtra le notizie per titolo');
    expect(input).toHaveAttribute('type', 'search');
    expect(input).toHaveAttribute('placeholder', 'Filtra per titolo…');

    await user.type(input, 'rock');

    // Il testo c'è e non c'è nessuna ✕ nostra accanto a quella nativa.
    expect(input).toHaveValue('rock');
    expect(
      screen.queryByRole('button', { name: 'Azzera il filtro' }),
    ).not.toBeInTheDocument();
  });

  it('manda il testo digitato al server come filtro, dopo la pausa di digitazione', async () => {
    const user = userEvent.setup();
    renderApp(<NewsSection />);
    await waitFor(() => expect(getPosts).toHaveBeenCalledTimes(1));

    await user.type(
      screen.getByLabelText('Filtra le notizie per titolo'),
      'rock',
    );

    await waitFor(() =>
      expect(getPosts).toHaveBeenCalledWith('/posts', {
        params: { title: 'rock' },
      }),
    );
  });
});
