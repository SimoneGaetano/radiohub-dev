/**
 * Tema chiaro/scuro (bonus X7).
 *
 * Il tema è una classe sulla radice del documento (`.palette-dark` /
 * `.palette-light`, vedi `index.css`): i colori sono variabili CSS di Tailwind,
 * quindi non serve toccare i componenti.
 *
 * Scelte dichiarate:
 * - il default è il **tema scuro**, che è quello del progetto: la preferenza del
 *   sistema non viene forzata, così un ospite al primo accesso vede comunque
 *   l'app come è stata disegnata;
 * - la scelta dell'utente è ricordata in `localStorage` e ha sempre la
 *   precedenza;
 * - `theme-color` (la barra del browser su mobile) viene aggiornato insieme al
 *   tema, altrimenti resterebbe scuro su una pagina chiara.
 */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'radiohub:theme';

/** Colore del fondo pagina per tema, per il `<meta name="theme-color">`. */
const THEME_COLOR: Record<Theme, string> = {
  dark: '#020617',
  light: '#f1f5f9',
};

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** Preferenza salvata sul dispositivo, se presente e valida. */
export function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    // Storage non disponibile (modalità privata): si usa il default.
    return null;
  }
}

/** Applica il tema al documento e lo ricorda. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('palette-light', theme === 'light');
  root.classList.toggle('palette-dark', theme === 'dark');
  root.dataset.theme = theme;

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', THEME_COLOR[theme]);

  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // La preferenza non è persistita: il tema resta valido per la sessione.
  }
}

/**
 * Applica il tema all'avvio, prima del render (da `main.tsx`): evita che la
 * pagina compaia nel tema sbagliato per un istante.
 */
export function initTheme(): Theme {
  const theme = readStoredTheme() ?? 'dark';
  applyTheme(theme);
  return theme;
}
