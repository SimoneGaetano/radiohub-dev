import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  api,
  clearSession,
  extractErrorMessage,
  REFRESH_TOKEN_STORAGE_KEY,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} from '../../services/api';
import type { AuthUser, LoginResponse, RegisterResponse } from '../../types';

type AsyncStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  status: AsyncStatus;
  error: string | null;
}

interface Credentials {
  email: string;
  password: string;
}

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

const initialState: AuthState = {
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  user: readStoredUser(),
  status: 'idle',
  error: null,
};

/** Authenticates and persists the JWT + user in localStorage. */
export const login = createAsyncThunk<
  LoginResponse,
  Credentials,
  { rejectValue: string }
>('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post<LoginResponse>('/auth/login', credentials);
    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));
    // X6: il gettone di rinnovo sta solo in localStorage — lo legge
    // l'interceptor di `services/api.ts`, l'interfaccia non lo mostra.
    if (data.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, data.refreshToken);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }
    return data;
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/** Creates an account (password is hashed server side). */
export const register = createAsyncThunk<
  AuthUser,
  Credentials,
  { rejectValue: string }
>('auth/register', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post<RegisterResponse>(
      '/auth/register',
      credentials,
    );
    return data.user;
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/**
 * Clears the persisted session. X6: prima azzera il gettone sul server, così il
 * logout non è solo un gesto locale — senza questa chiamata il JWT resterebbe
 * rinnovabile fino alla sua scadenza.
 */
export const logout = createAsyncThunk('auth/logout', async () => {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);

  if (refreshToken) {
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {
      // Best effort dichiarato: se la rete o il server non rispondono, la
      // sessione locale si chiude comunque e il gettone scadrà da solo.
    }
  }

  clearSession();
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.error = null;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'Login non riuscito';
      })
      .addCase(register.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(register.fulfilled, (state) => {
        state.status = 'succeeded';
        state.error = null;
      })
      .addCase(register.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'Registrazione non riuscita';
      })
      .addCase(logout.fulfilled, (state) => {
        state.token = null;
        state.user = null;
        state.status = 'idle';
        state.error = null;
      });
  },
});

export const { clearAuthError } = authSlice.actions;
export default authSlice.reducer;
