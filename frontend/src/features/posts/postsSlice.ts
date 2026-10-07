import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api, extractErrorMessage } from '../../services/api';
import type { Post, PostsResponse, SummaryResponse, SummaryResult } from '../../types';

type AsyncStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface PostsState {
  items: Post[];
  status: AsyncStatus;
  error: string | null;
  /** Id of the post currently being summarised. */
  summarizingId: string | null;
}

const initialState: PostsState = {
  items: [],
  status: 'idle',
  error: null,
  summarizingId: null,
};

/** Loads the news list. */
export const fetchPosts = createAsyncThunk<Post[], void, { rejectValue: string }>(
  'posts/fetch',
  async (_arg, { rejectWithValue }) => {
    try {
      const { data } = await api.get<PostsResponse>('/posts');
      return data.data;
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error));
    }
  },
);

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

const postsSlice = createSlice({
  name: 'posts',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPosts.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchPosts.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;
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
      })
      .addCase(summarizePost.rejected, (state, action) => {
        state.summarizingId = null;
        state.error = action.payload ?? 'Riassunto non riuscito';
      });
  },
});

export default postsSlice.reducer;