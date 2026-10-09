import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import {
  api,
  extractErrorMessage,
  TOKEN_STORAGE_KEY,
} from '../../services/api';
import type {
  FavoritesResponse,
  PlaybackStatus,
  RadiosResponse,
  RadioStation,
} from '../../types';

/** localStorage keys for the library data kept on this device. */
const FAVORITES_STORAGE_KEY = 'radiohub:favorites:v1';
const RECENTS_STORAGE_KEY = 'radiohub:recents:v1';

/** Slot used when nobody is signed in on this device. */
export const GUEST_OWNER = 'guest';

/**
 * A device holds **one library per identity**: the guest slot (no suffix) and
 * one slot per account. Switching user therefore shows that user's own
 * favourites/history — and switching back to guest restores the guest slot.
 */
function libraryKeys(owner: string): { favorites: string; recents: string } {
  const suffix = owner === GUEST_OWNER ? '' : `:u:${owner}`;
  return {
    favorites: `${FAVORITES_STORAGE_KEY}${suffix}`,
    recents: `${RECENTS_STORAGE_KEY}${suffix}`,
  };
}

/** Deletes every file of a library slot (used when the guest one is adopted). */
function dropLibrary(owner: string): void {
  const keys = libraryKeys(owner);
  try {
    localStorage.removeItem(keys.favorites);
    localStorage.removeItem(keys.recents);
  } catch {
    // Private mode: nothing to clean up.
  }
}

/** At most ten stations are kept in the "recently played" history. */
const MAX_RECENTS = 10;

interface PersistedLibrary {
  ids: string[];
  stations: Record<string, RadioStation>;
}

/** Reads a persisted id list + station map, tolerating missing or corrupt data. */
function readLibrary(key: string): PersistedLibrary {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return { ids: [], stations: {} };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedLibrary>;
    const ids = Array.isArray(parsed.ids)
      ? parsed.ids.filter((id): id is string => typeof id === 'string')
      : [];
    const stations =
      parsed.stations !== null && typeof parsed.stations === 'object'
        ? parsed.stations
        : {};
    return { ids, stations };
  } catch {
    return { ids: [], stations: {} };
  }
}

function writeLibrary(
  key: string,
  ids: string[],
  stations: Record<string, RadioStation>,
): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ids, stations }));
  } catch {
    // Private mode or full quota: the in-memory Redux state keeps working.
  }
}

function persistFavorites(state: PlayerState): void {
  writeLibrary(
    libraryKeys(state.libraryOwner).favorites,
    state.favoriteIds,
    state.favoriteStations,
  );
}

/**
 * Resolves the full station objects for the ids this device does not know yet
 * (favourites/recents created on another device and stored server-side).
 * The backend proxies the upstream source and caches the result.
 */
async function resolveStations(
  ids: string[],
): Promise<Record<string, RadioStation>> {
  if (ids.length === 0) {
    return {};
  }
  const { data } = await api.get<RadiosResponse>('/radios/by-ids', {
    params: { ids: ids.slice(0, 50).join(',') },
  });
  const stations: Record<string, RadioStation> = {};
  for (const station of data.data) {
    stations[station.id] = station;
  }
  return stations;
}

/** `true` when a JWT is stored, i.e. the user is signed in on this device. */
function hasSession(): boolean {
  return Boolean(localStorage.getItem(TOKEN_STORAGE_KEY));
}

/** Moves a station to the front of the recents, trimming to MAX_RECENTS. */
function pushRecent(state: PlayerState, station: RadioStation): void {
  const ids = [
    station.id,
    ...state.recentIds.filter((id) => id !== station.id),
  ].slice(0, MAX_RECENTS);
  const stations: Record<string, RadioStation> = {
    ...state.recentStations,
    [station.id]: station,
  };
  for (const key of Object.keys(stations)) {
    if (!ids.includes(key)) {
      delete stations[key];
    }
  }
  state.recentIds = ids;
  state.recentStations = stations;
  writeLibrary(libraryKeys(state.libraryOwner).recents, ids, stations);
}

interface PlayerState {
  current: RadioStation | null;
  isPlaying: boolean;
  /** Volume in the [0, 1] range. */
  volume: number;
  /** Whether the full-screen player overlay is open. */
  expanded: boolean;
  /** Epoch ms at which playback must stop. Null while the timer is off. */
  sleepEndsAt: number | null;
  /** Stream state driving the F2 status indicator (live/buffering/errore). */
  playbackStatus: PlaybackStatus;
  /** Bumped to force a fresh load of the current stream (retry or resume). */
  attempt: number;
  /** Favourite station ids, in the order they were added. */
  favoriteIds: string[];
  /** Full station objects for favourites, so they render even outside search results. */
  favoriteStations: Record<string, RadioStation>;
  /** Recently played station ids, most recent first. */
  recentIds: string[];
  /** Full station objects backing the recents strip. */
  recentStations: Record<string, RadioStation>;
  /** Library slot in use: `guest` or the signed-in user id. */
  libraryOwner: string;
}

const storedFavorites = readLibrary(FAVORITES_STORAGE_KEY);
const storedRecents = readLibrary(RECENTS_STORAGE_KEY);

const initialState: PlayerState = {
  current: null,
  isPlaying: false,
  volume: 0.8,
  expanded: false,
  sleepEndsAt: null,
  playbackStatus: 'idle',
  attempt: 0,
  favoriteIds: storedFavorites.ids,
  favoriteStations: storedFavorites.stations,
  recentIds: storedRecents.ids,
  recentStations: storedRecents.stations,
  libraryOwner: GUEST_OWNER,
};

const playerSlice = createSlice({
  name: 'player',
  initialState,
  reducers: {
    /** Selects a station and starts playback. */
    playStation(state, action: PayloadAction<RadioStation>) {
      state.current = action.payload;
      state.isPlaying = true;
      state.playbackStatus = 'buffering';
      state.attempt = 0;
      pushRecent(state, action.payload);
    },
    togglePlay(state) {
      if (state.current) {
        state.isPlaying = !state.isPlaying;
        if (state.isPlaying) {
          // Resuming a live stream needs a fresh connection: bumping `attempt`
          // makes the player reload the source instead of replaying old buffer.
          state.attempt += 1;
          state.playbackStatus = 'buffering';
        } else {
          state.playbackStatus = 'idle';
        }
      }
    },
    /** Steps to the neighbour in the given list; clamped at both ends. */
    stepStation(
      state,
      action: PayloadAction<{ stations: RadioStation[]; delta: -1 | 1 }>,
    ) {
      const { stations, delta } = action.payload;
      const currentId = state.current?.id;
      if (!currentId || stations.length === 0) {
        return;
      }
      const index = stations.findIndex((station) => station.id === currentId);
      if (index === -1) {
        return;
      }
      const target = stations[index + delta];
      if (target) {
        state.current = target;
        state.isPlaying = true;
        state.playbackStatus = 'buffering';
        state.attempt = 0;
        pushRecent(state, target);
      }
    },
    stopPlayback(state) {
      state.isPlaying = false;
      state.playbackStatus = 'idle';
    },
    /**
     * The stream could not be started even after the automatic retry (server
     * refusing the connection, unsupported codec, geo-block): playback stops and
     * the indicator switches to the error state, where the user can retry.
     */
    playbackFailed(state) {
      state.isPlaying = false;
      state.playbackStatus = 'error';
    },
    /** Driven by the media events of the audio element (F2 indicator). */
    setPlaybackStatus(state, action: PayloadAction<PlaybackStatus>) {
      state.playbackStatus = action.payload;
    },
    /** Retries the current station: reloads the source and plays it again. */
    retryPlayback(state) {
      if (!state.current) {
        return;
      }
      state.attempt += 1;
      state.isPlaying = true;
      state.playbackStatus = 'buffering';
    },
    setVolume(state, action: PayloadAction<number>) {
      state.volume = Math.min(1, Math.max(0, action.payload));
    },
    /** Expands the player to the full-screen overlay, or collapses it. */
    setExpanded(state, action: PayloadAction<boolean>) {
      state.expanded = action.payload;
    },
    /** Schedules an automatic stop `minutes` from now; non-positive clears it. */
    setSleepTimer(state, action: PayloadAction<number>) {
      const minutes = action.payload;
      if (!Number.isFinite(minutes) || minutes <= 0) {
        state.sleepEndsAt = null;
        return;
      }
      state.sleepEndsAt = Date.now() + Math.round(minutes * 60_000);
    },
    /** Cancels a pending automatic stop. */
    clearSleepTimer(state) {
      state.sleepEndsAt = null;
    },
    /** Fires when the countdown elapses: stops playback and clears the timer. */
    expireSleepTimer(state) {
      state.isPlaying = false;
      state.playbackStatus = 'idle';
      state.sleepEndsAt = null;
    },
    /** Stops playback and clears the station, dismissing the player for good. */
    clearPlayer(state) {
      state.current = null;
      state.isPlaying = false;
      state.playbackStatus = 'idle';
      state.attempt = 0;
      state.expanded = false;
    },
    /** Adds or removes a station from the favourites, persisting to localStorage. */
    toggleFavorite(state, action: PayloadAction<RadioStation>) {
      const station = action.payload;
      const index = state.favoriteIds.indexOf(station.id);
      if (index >= 0) {
        state.favoriteIds.splice(index, 1);
        delete state.favoriteStations[station.id];
      } else {
        state.favoriteIds.push(station.id);
        state.favoriteStations[station.id] = station;
      }
      persistFavorites(state);
    },
    /** Empties the recently-played history of the active library. */
    clearRecents(state) {
      state.recentIds = [];
      state.recentStations = {};
      writeLibrary(libraryKeys(state.libraryOwner).recents, [], {});
    },
    /**
     * Switches the active library: the current one is persisted under its own
     * owner, then the target slot is loaded (empty for a fresh guest slot).
     * This is what makes "sign in / sign out / sign in as someone else" visible
     * without ever deleting an account's data (it lives on the server).
     */
    switchLibraryOwner(state, action: PayloadAction<string>) {
      const owner = action.payload;
      if (owner === state.libraryOwner) {
        return;
      }

      const current = libraryKeys(state.libraryOwner);
      writeLibrary(
        current.favorites,
        state.favoriteIds,
        state.favoriteStations,
      );
      writeLibrary(current.recents, state.recentIds, state.recentStations);

      const target = libraryKeys(owner);
      const favorites = readLibrary(target.favorites);
      const recents = readLibrary(target.recents);

      state.libraryOwner = owner;
      state.favoriteIds = favorites.ids;
      state.favoriteStations = favorites.stations;
      state.recentIds = recents.ids;
      state.recentStations = recents.stations;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(syncFavorites.fulfilled, (state, action) => {
        const { ids, stations } = action.payload;
        state.favoriteIds = ids;
        // Keep the objects already known on this device, add the ones resolved
        // by the backend and drop the stations no longer marked as favourites.
        const known: Record<string, RadioStation> = {
          ...state.favoriteStations,
          ...stations,
        };
        const next: Record<string, RadioStation> = {};
        for (const id of ids) {
          const station = known[id] ?? state.recentStations[id];
          if (station) {
            next[id] = station;
          }
        }
        state.favoriteStations = next;
        persistFavorites(state);
      })
      .addCase(clearFavorites.fulfilled, (state) => {
        state.favoriteIds = [];
        state.favoriteStations = {};
        persistFavorites(state);
      })
      .addCase(adoptGuestLibrary.fulfilled, (_state, action) => {
        if (!action.payload) {
          return;
        }
        // The guest data now lives on the account: empty the slot so another
        // account (or the next guest) does not inherit it.
        dropLibrary(GUEST_OWNER);
      })
      .addCase(fetchServerRecents.fulfilled, (state, action) => {
        const { ids, stations } = action.payload;
        const known: Record<string, RadioStation> = {
          ...state.recentStations,
          ...stations,
        };
        // Server order first (most recent), then the device-only entries.
        const merged = [...ids, ...state.recentIds].filter(
          (id, index, all) => all.indexOf(id) === index,
        );
        const next: Record<string, RadioStation> = {};
        const nextIds: string[] = [];
        for (const id of merged.slice(0, MAX_RECENTS)) {
          const station = known[id];
          if (station) {
            next[id] = station;
            nextIds.push(id);
          }
        }
        state.recentIds = nextIds;
        state.recentStations = next;
        writeLibrary(RECENTS_STORAGE_KEY, nextIds, next);
      });
  },
});

interface FavoriteChange {
  radioId: string;
  added: boolean;
}

/**
 * Mirrors a favourite toggle to the backend for signed-in users.
 * No token â†’ no-op: the local toggle already persisted the change.
 */
export const pushFavoriteChange = createAsyncThunk<
  void,
  FavoriteChange,
  { rejectValue: string }
>(
  'player/pushFavoriteChange',
  async ({ radioId, added }, { rejectWithValue }) => {
    try {
      if (added) {
        await api.post('/favorites', { radioId });
      } else {
        await api.delete(`/favorites/${encodeURIComponent(radioId)}`);
      }
    } catch (error) {
      return rejectWithValue(extractErrorMessage(error));
    }
  },
);

/**
 * After login: pushes the local favourite ids to the backend, then reloads
 * the authoritative list. Guest data is never lost â€” the merge keeps the
 * locally created ids alongside the server ones.
 */
export interface SyncedLibrary {
  ids: string[];
  stations: Record<string, RadioStation>;
}

export const syncFavorites = createAsyncThunk<
  SyncedLibrary,
  void,
  { rejectValue: string }
>('player/syncFavorites', async (_, { getState, rejectWithValue }) => {
  try {
    const state = getState() as { player: PlayerState };
    const localIds = state.player.favoriteIds;
    for (const radioId of localIds) {
      await api.post('/favorites', { radioId });
    }
    const { data } = await api.get<FavoritesResponse>('/favorites');
    const serverIds = data.data.map((favorite) => favorite.radioId);
    const merged = [...serverIds];
    for (const id of localIds) {
      if (!merged.includes(id)) {
        merged.push(id);
      }
    }
    // Resolve the station objects this device does not know yet (favourites
    // saved from another device): without them the list could not be rendered.
    const unknown = merged.filter((id) => !state.player.favoriteStations[id]);
    const stations = await resolveStations(unknown);

    return { ids: merged, stations };
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/**
 * Removes every favourite: locally always, and on the server when a session
 * exists. Nothing is deleted automatically at logout — this runs only when the
 * user presses the explicit "Svuota preferiti" button.
 */
export const clearFavorites = createAsyncThunk<
  void,
  void,
  { rejectValue: string }
>('player/clearFavorites', async (_, { getState, rejectWithValue }) => {
  try {
    const state = getState() as { player: PlayerState };
    if (hasSession()) {
      await Promise.all(
        state.player.favoriteIds.map((radioId) =>
          api
            .delete(`/favorites/${encodeURIComponent(radioId)}`)
            .catch(() => undefined),
        ),
      );
    }
    return undefined;
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

export interface ServerRecents {
  ids: string[];
  stations: Record<string, RadioStation>;
}

/**
 * Loads the per-account listening history (it follows the user across devices)
 * and resolves the stations this device has never seen.
 */
export const fetchServerRecents = createAsyncThunk<
  ServerRecents,
  void,
  { rejectValue: string }
>('player/fetchServerRecents', async (_, { rejectWithValue }) => {
  try {
    const { data } = await api.get<{ data: Array<{ radioId: string }> }>(
      '/recents',
    );
    const ids = data.data.map((row) => row.radioId);
    const stations = await resolveStations(ids);
    return { ids, stations };
  } catch (error) {
    return rejectWithValue(extractErrorMessage(error));
  }
});

/**
 * First sign-in on this device: the **guest** library is handed over to the
 * account (favourites and history are pushed to the server) and the guest slot
 * is emptied, so a different account signing in later starts from its own data
 * instead of inheriting what somebody else saved. Nothing is lost: the data now
 * belongs to the account.
 */
export const adoptGuestLibrary = createAsyncThunk<boolean, void>(
  'player/adoptGuestLibrary',
  async () => {
    if (!hasSession()) {
      return false;
    }

    const keys = libraryKeys(GUEST_OWNER);
    const favorites = readLibrary(keys.favorites);
    const recents = readLibrary(keys.recents);

    if (favorites.ids.length === 0 && recents.ids.length === 0) {
      return false;
    }

    for (const radioId of favorites.ids) {
      await api.post('/favorites', { radioId }).catch(() => undefined);
    }
    for (const radioId of recents.ids) {
      await api.post('/recents', { radioId }).catch(() => undefined);
    }
    return true;
  },
);

/** Records a play on the server (best effort: it never blocks playback). */
export const pushRecentPlay = createAsyncThunk<void, string>(
  'player/pushRecentPlay',
  async (radioId) => {
    if (!hasSession()) {
      return;
    }
    await api.post('/recents', { radioId }).catch(() => undefined);
  },
);

/** Empties the server-side history of the signed-in user (best effort). */
export const clearServerRecents = createAsyncThunk<void, void>(
  'player/clearServerRecents',
  async () => {
    if (!hasSession()) {
      return;
    }
    await api.delete('/recents').catch(() => undefined);
  },
);

export const {
  playStation,
  togglePlay,
  stepStation,
  stopPlayback,
  playbackFailed,
  setPlaybackStatus,
  retryPlayback,
  setVolume,
  setExpanded,
  setSleepTimer,
  clearSleepTimer,
  expireSleepTimer,
  clearPlayer,
  toggleFavorite,
  clearRecents,
  switchLibraryOwner,
} = playerSlice.actions;
export default playerSlice.reducer;
