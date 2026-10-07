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

export type CacheStatus = 'HIT' | 'MISS';

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
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