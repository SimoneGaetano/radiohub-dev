import axios from 'axios';

export const TOKEN_STORAGE_KEY = 'radiohub.token';
export const USER_STORAGE_KEY = 'radiohub.user';

export interface ApiErrorBody {
  error?: string;
  message?: string;
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attaches the stored JWT to every authenticated request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Normalises backend / network errors into a human readable message.
 */
export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.error ?? error.message ?? 'Errore di rete';
  }
  return error instanceof Error ? error.message : 'Errore sconosciuto';
}