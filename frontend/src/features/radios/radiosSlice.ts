import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { api, extractErrorMessage } from '../../services/api';
import type {
  CacheStatus,
  NaturalSearchInterpretation,
  NaturalSearchResponse,
  RadioStation,
  RadiosResponse,
} from '../../types';

type AsyncStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface RadiosState {
  items: RadioStation[];
  status: AsyncStatus;
  error: string | null;
  /** Value of the `X-Cache` header returned by the backend. */
  cache: CacheStatus | null;
  query: string;
  /** Raw text typed in the search input (single source of truth). */
  searchTerm: string;
  /** Active genre/quality pill; 'all' disables local filtering. */
  genreFilter: string;
  /**
   * X3 — interpretazione dell'ultima frase in linguaggio naturale. Quando c'è,
   * l'orchestratore la usa come filtro della ricerca al posto del testo digitato.
   */
  interpretation: NaturalSearchInterpretation | null;
  /** Interpretazione in corso (il modello può metterci qualche secondo). */
  interpreting: boolean;
  /** Errore dell'ultima interpretazione, mostrato sotto la barra. */
  interpretError: string | null;
}

const initialState: RadiosState = {
  items: [],
  status: 'idle',
  error: null,
  cache: null,
  query: '',
  searchTerm: '',
  genreFilter: 'all',
  interpretation: null,
  interpreting: false,
  interpretError: null,
};

/**
 * The one clean call used by BOTH the initial page mount and the "Tutti"
 * pill: top 50 global stations, no query, no residue.
 * Keep the two call sites in sync by reusing this constant.
 */
export const TOP_STATIONS_LIMIT = 50;

export interface SearchParams {
  q: string;
  limit: number;
  page: number;
  /** Candidate upstream tags, tried in order by the backend. */
  tags?: string[];
  /** ISO country filter (`countrycode`). */
  countryCode?: string;
  /** Minimum bitrate. */
  bitrateMin?: number;
  /** Upstream ordering (e.g. `votes`). */
  order?: string;
}

/** Calls `GET /api/radios` and reads the `X-Cache` header. */
export const searchRadios = createAsyncThunk<
  { items: RadioStation[]; cache: CacheStatus | null; query: string },
  SearchParams,
  { rejectValue: string }
>('radios/search', async (params, { rejectWithValue }) => {
  try {
    const response = await api.get<RadiosResponse>('/radios', {
      params: {
        limit: params.limit,
        page: params.page,
        ...(params.q ? { q: params.q } : {}),
        ...(params.tags && params.tags.length > 0
          ? { tag: params.tags.join(',') }
          : {}),
        ...(params.countryCode ? { countryCode: params.countryCode } : {}),
        ...(params.bitrateMin !== undefined
          ? { bitrateMin: params.bitrateMin }
          : {}),
        ...(params.order ? { order: params.order } : {}),
      },
    });

    const raw = String(response.headers['x-cache'] ?? '');
    const cache: CacheStatus | null =
      raw === 'HIT' ? 'HIT' : raw === 'MISS' ? 'MISS' : null;

    return { items: response.data.data, cache, query: params.q };
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/**
 * X3 — interpreta una frase in italiano ("voglio una radio jazz italiana") e la
 * traduce nei filtri di ricerca. Il backend risponde con **l'interpretazione**,
 * non con le stazioni: la ricerca la esegue lo stesso orchestratore di sempre, e
 * l'utente vede cosa è stato capito (e può correggerlo).
 */
export const interpretSearch = createAsyncThunk<
  NaturalSearchInterpretation,
  string,
  { rejectValue: string }
>('radios/interpret', async (query, { rejectWithValue }) => {
  try {
    const response = await api.post<NaturalSearchResponse>('/radios/search', {
      query,
    });
    return response.data.data;
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

const radiosSlice = createSlice({
  name: 'radios',
  initialState,
  reducers: {
    /** Raw text typed in the search input (single source of truth). */
    setSearchTerm(state, action: PayloadAction<string>) {
      state.searchTerm = action.payload;
    },
    /** Selects the active genre/quality pill ('all' disables filtering). */
    setGenreFilter(state, action: PayloadAction<string>) {
      state.genreFilter = action.payload;
    },
    /**
     * X3 — dimentica l'interpretazione: la ricerca torna a derivare dal testo
     * digitato e dalla pill attiva.
     */
    clearInterpretation(state) {
      state.interpretation = null;
      state.interpretError = null;
    },
    /**
     * Clean reset to the "Tutti" baseline: clears every filter residue
     * (tag/country/search) so the next fetch is a clean top-50 call.
     */
    resetRadiosFilters(state) {
      state.searchTerm = '';
      state.genreFilter = 'all';
      state.query = '';
      state.interpretation = null;
      state.interpretError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchRadios.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(searchRadios.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload.items;
        state.cache = action.payload.cache;
        state.query = action.payload.query;
        state.error = null;
      })
      .addCase(searchRadios.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'Ricerca non riuscita';
      })
      .addCase(interpretSearch.pending, (state) => {
        state.interpreting = true;
        state.interpretError = null;
      })
      .addCase(interpretSearch.fulfilled, (state, action) => {
        state.interpreting = false;
        state.interpretation = action.payload;
      })
      .addCase(interpretSearch.rejected, (state, action) => {
        state.interpreting = false;
        state.interpretError = action.payload ?? 'Interpretazione non riuscita';
      });
  },
});

export const {
  setSearchTerm,
  setGenreFilter,
  clearInterpretation,
  resetRadiosFilters,
} = radiosSlice.actions;
export default radiosSlice.reducer;
