import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, extractErrorMessage } from '../../services/api';
import type { CacheStatus, RadioStation, RadiosResponse } from '../../types';

type AsyncStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface RadiosState {
  items: RadioStation[];
  status: AsyncStatus;
  error: string | null;
  /** Value of the `X-Cache` header returned by the backend. */
  cache: CacheStatus | null;
  query: string;
}

const initialState: RadiosState = {
  items: [],
  status: 'idle',
  error: null,
  cache: null,
  query: '',
};

export interface SearchParams {
  q: string;
  limit: number;
  page: number;
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

const radiosSlice = createSlice({
  name: 'radios',
  initialState,
  reducers: {},
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
      });
  },
});

export default radiosSlice.reducer;