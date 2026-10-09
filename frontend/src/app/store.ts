import { combineReducers, configureStore } from '@reduxjs/toolkit';
import authReducer from '../features/auth/authSlice';
import playerReducer from '../features/player/playerSlice';
import postsReducer from '../features/posts/postsSlice';
import radiosReducer from '../features/radios/radiosSlice';

/**
 * Reducer radice e stato, derivati **dai reducer** e non dallo store: derivare
 * `RootState` da `typeof store.getState` creerebbe un ciclo nei tipi, perché lo
 * store nasce dalla factory che riceve `RootState` come parametro.
 */
const rootReducer = combineReducers({
  auth: authReducer,
  radios: radiosReducer,
  posts: postsReducer,
  player: playerReducer,
});

/**
 * Lo stato radice è quello composto da `combineReducers`. Derivarlo dai reducer
 * (e **non** da `typeof store.getState`) evita un ciclo nei tipi: lo store nasce
 * dalla factory che riceve proprio `RootState`.
 */
export type RootState = ReturnType<typeof rootReducer>;

/**
 * Crea uno store nuovo. La factory esiste per i **test**, che devono partire da
 * uno stato pulito senza condividere il singleton dell'app (D4).
 */
export function createStore(preloadedState?: Partial<RootState>) {
  return configureStore({ reducer: rootReducer, preloadedState });
}

export const store = createStore();

export type AppDispatch = typeof store.dispatch;
