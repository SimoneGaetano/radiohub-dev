import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import playerReducer from '../features/player/playerSlice';
import postsReducer from '../features/posts/postsSlice';
import radiosReducer from '../features/radios/radiosSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    radios: radiosReducer,
    posts: postsReducer,
    player: playerReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;