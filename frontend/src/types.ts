/** A radio station as returned by `GET /api/radios`. */
export interface RadioStation {
  id: string;
  name: string;
  url: string;
  favicon: string;
  country: string;
  countryCode: string;
  language: string;
  tags: string[];
  votes: number;
  codec: string;
  bitrate: number;
}

export interface RadiosMeta {
  query: string | null;
  limit: number;
  page: number;
  count: number;
  source: string;
}

export interface RadiosResponse {
  data: RadioStation[];
  meta: RadiosMeta;
}

/** X3 — filtri riconosciuti in una frase (`POST /api/radios/search`). */
export interface NaturalSearchFilters {
  q?: string;
  tags?: string[];
  countryCode?: string;
  bitrateMin?: number;
  order?: 'votes' | 'name' | 'clickcount' | 'bitrate';
}

export interface NaturalSearchInterpretation {
  originalQuery: string;
  filters: NaturalSearchFilters;
  /** Chi ha interpretato: il modello (`ai`) o le regole deterministiche. */
  source: 'ai' | 'rules';
  /** Provider del modello, `null` quando ha risposto con le regole. */
  provider: string | null;
  /** Parole riconosciute nei dizionari. */
  matched: string[];
  /** Spiegazione breve del modello, quando presente. */
  note: string | null;
  /** Motivo del passaggio alle regole (`no-provider`, `invalid json`, ...). */
  fallbackReason: string | null;
}

export interface NaturalSearchResponse {
  data: NaturalSearchInterpretation;
}

/** X5 — evento pubblicato dal backend quando il sync trova post nuovi. */
export interface PostEventPayload {
  /** Post inseriti dall'ultima sincronizzazione. */
  created: number;
  /** Post aggiornati (il feed ha riscritto il testo). */
  updated: number;
  /** Istante della sincronizzazione, in ISO 8601. */
  at: string;
}

export type CacheStatus = 'HIT' | 'MISS';

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  /**
   * X6: gettone di rinnovo **monouso**, opaco e non un JWT. Vale `null` quando lo
   * store delle sessioni non risponde: la sessione breve resta valida, si perde
   * solo il rinnovo automatico.
   */
  refreshToken: string | null;
  user: AuthUser;
}

export interface RegisterResponse {
  user: AuthUser;
}

export interface Post {
  id: string;
  externalId: string;
  title: string;
  content: string;
  publishedAt: string;
  summary: string | null;
  createdAt: string;
}

export interface PostsResponse {
  data: Post[];
}

export interface SummaryResult {
  id: string;
  title: string;
  summary: string;
  generated: boolean;
  provider: string;
}

export interface SummaryResponse {
  data: SummaryResult;
}

export interface Favorite {
  id: string;
  userId: string;
  radioId: string;
  createdAt: string;
}

export interface FavoritesResponse {
  data: Favorite[];
}

/** Shape returned by `POST /api/ai/radio-info`. */
export interface RadioInfoResponse {
  data: {
    radioId: string;
    radioName: string;
    bio: string;
  };
}

/**
 * State of the audio stream of the player, shown by the F2 status indicator:
 * `idle` (nothing to play), `buffering` (connecting), `live` (playing) and
 * `error` (the stream could not be started, see "Riprova").
 */
export type PlaybackStatus = 'idle' | 'buffering' | 'live' | 'error';
