import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { RadioStation } from '../../types';

interface PlayerState {
  current: RadioStation | null;
  isPlaying: boolean;
  /** Volume in the [0, 1] range. */
  volume: number;
  /** Whether the full-screen player overlay is open. */
  expanded: boolean;
}

const initialState: PlayerState = {
  current: null,
  isPlaying: false,
  volume: 0.8,
  expanded: false,
};

const playerSlice = createSlice({
  name: 'player',
  initialState,
  reducers: {
    /** Selects a station and starts playback. */
    playStation(state, action: PayloadAction<RadioStation>) {
      state.current = action.payload;
      state.isPlaying = true;
    },
    togglePlay(state) {
      if (state.current) {
        state.isPlaying = !state.isPlaying;
      }
    },
    stopPlayback(state) {
      state.isPlaying = false;
    },
    setVolume(state, action: PayloadAction<number>) {
      state.volume = Math.min(1, Math.max(0, action.payload));
    },
    /** Expands the player to the full-screen overlay, or collapses it. */
    setExpanded(state, action: PayloadAction<boolean>) {
      state.expanded = action.payload;
    },
    /** Stops playback and clears the station, dismissing the player for good. */
    clearPlayer(state) {
      state.current = null;
      state.isPlaying = false;
      state.expanded = false;
    },
  },
});

export const {
  playStation,
  togglePlay,
  stopPlayback,
  setVolume,
  setExpanded,
  clearPlayer,
} = playerSlice.actions;
export default playerSlice.reducer;