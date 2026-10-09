import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, extractErrorMessage, TOKEN_STORAGE_KEY } from '../../services/api';
import type {
  Post,
  PostsResponse,
  SummaryResponse,
  SummaryResult,
  RadioInfoResponse,
} from '../../types';

type AsyncStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

/**
 * How many news cards are revealed at a time (F3).
 *
 * Deliberate choice: the filtered list is fetched in **one** request, because
 * the plain guest listing is exactly the payload Redis caches (B3). "Load more"
 * then only widens a local window over the rows already in the store, so it
 * never re-downloads the same articles (no `?page=` round trip per step) and the
 * whole section stays instant. `?items=` on the API remains the tool for a
 * caller that really wants a server-truncated list.
 */
export const NEWS_PAGE_SIZE = 6;

interface PostsState {
  items: Post[];
  status: AsyncStatus;
  error: string | null;
  /** Id of the post currently being summarised. */
  summarizingId: string | null;
  radioInfo: RadioInfoResponse | null;
  radioInfoLoading: boolean;
  /** Title filter currently in force on the server (F3). Empty = no filter. */
  titleFilter: string;
  /** How many rows of `items` are visible: client-side paging (F3). */
  visible: number;
}

const initialState: PostsState = {
  items: [],
  status: 'idle',
  error: null,
  summarizingId: null,
  radioInfo: null,
  radioInfoLoading: false,
  titleFilter: '',
  visible: NEWS_PAGE_SIZE,
};

/** Summaries generated on this device while browsing as a guest. */
const SUMMARY_STORAGE_KEY = 'radiohub:summaries:v1';

/** Reads the guest summary cache, tolerating missing or corrupt data. */
function readLocalSummaries(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SUMMARY_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const summaries: Record<string, string> = {};
    for (const [postId, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.length > 0) {
        summaries[postId] = value;
      }
    }
    return summaries;
  } catch {
    return {};
  }
}

function writeLocalSummaries(summaries: Record<string, string>): void {
  try {
    localStorage.setItem(SUMMARY_STORAGE_KEY, JSON.stringify(summaries));
  } catch {
    // Private mode or full quota: the in-memory state keeps working.
  }
}

/**
 * Loads the news posts from `GET /api/posts`.
 *
 * - Without `title`: the plain listing, i.e. the Redis-cached payload (B3).
 * - With `title`: the **server-side** filter of B2 (`?title=…`), so the search
 *   covers the whole table instead of only the rows already downloaded.
 */
export const fetchPosts = createAsyncThunk<
  Post[],
  { title?: string } | undefined,
  { rejectValue: string }
>('posts/fetchPosts', async (arg, { rejectWithValue }) => {
  const title = arg?.title?.trim();
  try {
    const { data } = await api.get<PostsResponse>(
      '/posts',
      title ? { params: { title } } : undefined,
    );
    return data.data;
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/** Requests (or reads back) the AI summary of a post. */
export const summarizePost = createAsyncThunk<
  SummaryResult,
  string,
  { rejectValue: string }
>('posts/summarize', async (postId, { rejectWithValue }) => {
  try {
    const { data } = await api.post<SummaryResponse>(`/posts/${postId}/summary`);
    return data.data;
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/** Generates a radio bio / curiosities via `POST /api/ai/radio-info`. */
export const fetchRadioInfo = createAsyncThunk<
  RadioInfoResponse,
  {
    radioId: string;
    radioName: string;
    country?: string;
    tags?: string[];
  },
  { rejectValue: string }
>('posts/fetchRadioInfo', async (payload, { rejectWithValue }) => {
  const { radioId, radioName, country, tags } = payload;
  try {
    const { data } = await api.post<RadioInfoResponse>('/ai/radio-info', {
      radioId,
      radioName,
      country,
      tags,
    });
    return data;
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

const postsSlice = createSlice({
  name: 'posts',
  initialState,
  reducers: {
    /** Reveals the next page of the list already in the store (F3). */
    showMore: (state) => {
      state.visible += NEWS_PAGE_SIZE;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPosts.pending, (state, action) => {
        const next = action.meta.arg?.title?.trim() ?? '';
        if (next !== state.titleFilter) {
          // A different set of posts: restart from the first page and drop the
          // previous rows, so the reader sees the skeleton instead of articles
          // that no longer match what they typed.
          state.titleFilter = next;
          state.visible = NEWS_PAGE_SIZE;
          state.items = [];
        }
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchPosts.fulfilled, (state, action) => {
        state.status = 'succeeded';
        // Guests keep their own summaries on the device: when the server has
        // none (shared cache empty) the local copy fills the gap.
        const local = readLocalSummaries();
        state.items = action.payload.map((post) => {
          const stored = post.summary === null ? local[post.id] : undefined;
          return stored ? { ...post, summary: stored } : post;
        });
        state.error = null;
      })
      .addCase(fetchPosts.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'Caricamento notizie non riuscito';
      })
      .addCase(summarizePost.pending, (state, action) => {
        state.summarizingId = action.meta.arg;
        state.error = null;
      })
      .addCase(summarizePost.fulfilled, (state, action) => {
        state.summarizingId = null;
        const target = state.items.find((post) => post.id === action.payload.id);
        if (target) {
          target.summary = action.payload.summary;
        }
        // Guests: the per-user row lives on the server only for signed-in
        // users, so the device stores its own copy.
        if (!localStorage.getItem(TOKEN_STORAGE_KEY)) {
          const local = readLocalSummaries();
          local[action.payload.id] = action.payload.summary;
          writeLocalSummaries(local);
        }
      })
      .addCase(summarizePost.rejected, (state, action) => {
        state.summarizingId = null;
        state.error = action.payload ?? 'Riassunto non riuscito';
      })
      .addCase(fetchRadioInfo.pending, (state) => {
        state.radioInfoLoading = true;
        state.radioInfo = null;
        state.error = null;
      })
      .addCase(fetchRadioInfo.fulfilled, (state, action) => {
        state.radioInfoLoading = false;
        state.radioInfo = action.payload;
      })
      .addCase(fetchRadioInfo.rejected, (state, action) => {
        state.radioInfoLoading = false;
        state.radioInfo = null;
        state.error = action.payload ?? 'Generazione bio non riuscita';
      });
  },
});

export const { showMore } = postsSlice.actions;

export default postsSlice.reducer;
