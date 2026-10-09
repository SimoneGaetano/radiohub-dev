import { render } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { createStore, type RootState } from '../../src/app/store';
import { ToastProvider } from '../../src/components/Toast';

/** Store nuovo e vuoto: i test non devono condividere lo stato dell'app. */
export function makeStore(preloadedState?: Partial<RootState>) {
  return createStore(preloadedState);
}

/**
 * Renderizza un componente con lo stesso contorno che usa `App` (Redux +
 * provider dei toast). Restituisce anche lo store, così un test può leggere lo
 * stato dopo un'interazione invece di fidarsi del solo DOM.
 */
export function renderApp(ui: ReactElement, store = makeStore()) {
  return {
    store,
    ...render(
      <Provider store={store}>
        <ToastProvider>{ui}</ToastProvider>
      </Provider>,
    ),
  };
}

/**
 * Risposta axios finta: ai test interessano solo il corpo e l'header `X-Cache`,
 * il resto della risposta non viene mai letto dal codice.
 */
export function axiosResponse<T>(
  data: T,
  headers: Record<string, string> = {},
): AxiosResponse<T> {
  return { data, headers } as unknown as AxiosResponse<T>;
}
