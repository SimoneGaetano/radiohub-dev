import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchBar } from '../src/components/SearchBar';
import {
  setGenreFilter,
  TOP_STATIONS_LIMIT,
} from '../src/features/radios/radiosSlice';
import { api } from '../src/services/api';
import type { RadioStation, RadiosResponse } from '../src/types';
import { axiosResponse, makeStore, renderApp } from './helpers/renderApp';

/**
 * Ricerca radio (F1). Il test intercetta l'HTTP e verifica **cosa** viene chiesto
 * al server e **quando**: la pausa di digitazione è parte del requisito, quindi i
 * timer sono quelli veri (`waitFor`), non una loro imitazione.
 */
vi.mock('../src/services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/api')>();
  // `extractErrorMessage` e le chiavi di storage restano quelli veri: gli slice
  // li usano e i test non devono riscriverli.
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } };
});

const getRadios = vi.mocked(api.get);

const JAZZ: RadioStation = {
  id: 'jazz-fm',
  name: 'Jazz FM',
  url: 'https://stream.example/jazz',
  favicon: '',
  country: 'Italy',
  countryCode: 'IT',
  language: 'italian',
  tags: ['jazz'],
  votes: 12,
  codec: 'MP3',
  bitrate: 128,
};

const RESPONSE: RadiosResponse = {
  data: [JAZZ],
  meta: {
    query: null,
    limit: TOP_STATIONS_LIMIT,
    page: 1,
    count: 1,
    source: 'fm-world',
  },
};

beforeEach(() => {
  getRadios.mockReset();
  getRadios.mockResolvedValue(axiosResponse(RESPONSE, { 'x-cache': 'MISS' }));
});

describe('SearchBar — ricerca radio (F1)', () => {
  it('espone il campo con la sua etichetta accessibile', () => {
    renderApp(<SearchBar />);

    const input = screen.getByLabelText('Cerca una radio per nome');
    expect(input).toHaveAttribute('type', 'search');
    expect(input).toHaveAttribute('placeholder', 'jazz, rock, news…');
  });

  it('al montaggio chiede la classifica di base: nessuna query, tetto di 50', async () => {
    const { store } = renderApp(<SearchBar />);

    await waitFor(() => expect(getRadios).toHaveBeenCalledTimes(1));
    expect(getRadios).toHaveBeenCalledWith('/radios', {
      params: { limit: TOP_STATIONS_LIMIT, page: 1 },
    });
    await waitFor(() =>
      expect(store.getState().radios.status).toBe('succeeded'),
    );
    expect(store.getState().radios.items).toHaveLength(1);
    expect(store.getState().radios.cache).toBe('MISS');
  });

  it('dopo la pausa di digitazione cerca il testo e non la classifica', async () => {
    const user = userEvent.setup();
    const { store } = renderApp(<SearchBar />);
    await waitFor(() => expect(getRadios).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText('Cerca una radio per nome'), 'jazz');

    await waitFor(() =>
      expect(getRadios).toHaveBeenCalledWith('/radios', {
        params: { limit: 20, page: 1, q: 'jazz' },
      }),
    );
    expect(store.getState().radios.query).toBe('jazz');
  });

  it('digitare riporta la pill selezionata su "Tutti": la ricerca vince', async () => {
    const user = userEvent.setup();
    const store = makeStore();
    store.dispatch(setGenreFilter('rock'));
    renderApp(<SearchBar />, store);

    await user.type(screen.getByLabelText('Cerca una radio per nome'), 'j');

    expect(store.getState().radios.genreFilter).toBe('all');
  });

  it('svuotando il campo torna subito alla classifica, senza attendere la pausa', async () => {
    const user = userEvent.setup();
    renderApp(<SearchBar />);
    const input = screen.getByLabelText('Cerca una radio per nome');
    await waitFor(() => expect(getRadios).toHaveBeenCalledTimes(1));

    await user.type(input, 'jazz');
    await waitFor(() =>
      expect(getRadios).toHaveBeenCalledWith('/radios', {
        params: { limit: 20, page: 1, q: 'jazz' },
      }),
    );

    await user.clear(input);

    await waitFor(() =>
      expect(getRadios).toHaveBeenLastCalledWith('/radios', {
        params: { limit: TOP_STATIONS_LIMIT, page: 1 },
      }),
    );
  });
});
