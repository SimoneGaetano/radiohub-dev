import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { applyTheme, readStoredTheme, type Theme } from '../utils/theme';

/**
 * Interruttore chiaro/scuro (bonus X7). Vive nella barra in alto, tra le
 * sezioni e l'area profilo, quindi è raggiungibile anche dagli ospiti.
 *
 * L'icona mostra la **destinazione** (il sole quando sei nel tema scuro) e
 * `aria-label` descrive l'azione, non lo stato: così chi usa uno screen reader
 * sa cosa succede premendo.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme() ?? 'dark');
  const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
  const label =
    nextTheme === 'light' ? 'Passa al tema chiaro' : 'Passa al tema scuro';

  return (
    <button
      type="button"
      onClick={() => {
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-accent-border hover:text-accent-text"
    >
      {nextTheme === 'light' ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}
