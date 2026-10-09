import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './App';
import { store } from './app/store';
import { logout } from './features/auth/authSlice';
import { onSessionExpired } from './services/api';
import { captureInstallPrompt } from './utils/installPrompt';
import { initTheme } from './utils/theme';
import './index.css';

// Il tema va deciso prima del render, altrimenti la pagina comparirebbe per un
// istante nel tema sbagliato (X7).
initTheme();

// X6: quando il rinnovo della sessione fallisce davvero (refresh token scaduto o
// revocato), i servizi HTTP svuotano lo storage e avvisano qui: lo store si
// allinea, così l'interfaccia non resta "loggata" senza sessione valida.
onSessionExpired(() => {
  void store.dispatch(logout());
});

// Must run before React mounts: `beforeinstallprompt` can fire first, and the
// event is single-use (see `utils/installPrompt.ts`).
if ('serviceWorker' in navigator) {
  captureInstallPrompt();
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support unavailable: the app still works online.
    });
  });
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Elemento #root non trovato');
}

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
