import axios, { type InternalAxiosRequestConfig } from 'axios';
import type { LoginResponse } from '../types';

export const TOKEN_STORAGE_KEY = 'radiohub.token';
export const USER_STORAGE_KEY = 'radiohub.user';
/** X6: gettone di rinnovo, letto dall'interceptor e non dallo store. */
export const REFRESH_TOKEN_STORAGE_KEY = 'radiohub.refreshToken';

export interface ApiErrorBody {
  error?: string;
  message?: string;
}

/** Configurazione marcata come già ritentata: evita il rinnovo a catena. */
type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

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

/** Chiude la sessione lato client: via tutti e tre i valori salvati. */
export function clearSession(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

/**
 * Handler notificato quando il rinnovo fallisce **definitivamente** e la sessione
 * viene chiusa. È un callback registrato all'avvio e non un dispatch diretto per
 * non far dipendere i servizi HTTP dallo store Redux (che dipende già da loro).
 */
let sessionExpiredHandler: (() => void) | null = null;

export function onSessionExpired(handler: () => void): void {
  sessionExpiredHandler = handler;
}

/** Rinnovo in corso: più `401` simultanei condividono la stessa richiesta. */
let refreshInFlight: Promise<string | null> | null = null;

async function requestNewAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  if (!refreshToken) {
    return null;
  }

  try {
    // Chiamata con axios "nudo" e non con `api`: passando dall'interceptor, un
    // `401` sul refresh innescherebbe un altro refresh, all'infinito.
    const { data } = await axios.post<LoginResponse>(
      `${import.meta.env.VITE_API_BASE_URL ?? '/api'}/auth/refresh`,
      { refreshToken },
      { headers: { 'Content-Type': 'application/json' } },
    );

    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    if (data.refreshToken) {
      // Il gettone è monouso: va sostituito con quello appena emesso.
      localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, data.refreshToken);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    }
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(data.user));

    return data.token;
  } catch (error) {
    // `401`/`400` = il server ha rifiutato il gettone (scaduto, revocato,
    // riutilizzato): la sessione è finita. Qualunque altro errore (rete, `503`)
    // è temporaneo: la sessione resta e il rinnovo si ritenta più avanti.
    const status = axios.isAxiosError(error)
      ? error.response?.status
      : undefined;

    if (status === 400 || status === 401) {
      clearSession();
      sessionExpiredHandler?.();
    }
    return null;
  }
}

/**
 * X6 — rinnovo trasparente della sessione.
 *
 * Quando una richiesta applicativa riceve `401` (access token scaduto), si
 * chiede un token nuovo con il refresh token, si aggiorna l'header e si ripete
 * la richiesta originale **una volta sola**.
 */
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const config = error.config as RetriableConfig | undefined;
    const url = config?.url ?? '';
    const status = error.response?.status;

    // Solo `401` sulle rotte applicative, e solo al primo tentativo: le rotte
    // `/auth/*` usano `401` per "credenziali sbagliate" e non devono innescare
    // un rinnovo.
    if (
      status !== 401 ||
      !config ||
      config._retried ||
      url.includes('/auth/')
    ) {
      return Promise.reject(error);
    }

    config._retried = true;
    refreshInFlight ??= requestNewAccessToken().finally(() => {
      refreshInFlight = null;
    });
    const token = await refreshInFlight;

    if (!token) {
      return Promise.reject(error);
    }

    config.headers.Authorization = `Bearer ${token}`;
    return api.request(config);
  },
);

/**
 * Normalises backend / network errors into a human readable message.
 */
export function extractErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data?.error ?? error.message ?? 'Errore di rete';
  }
  return error instanceof Error ? error.message : 'Errore sconosciuto';
}
