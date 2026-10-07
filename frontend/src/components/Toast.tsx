import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  /** Shows a transient notification in the bottom-right corner. */
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** How long a toast stays on screen before dismissing itself. */
const TOAST_DURATION_MS = 4500;

/** At most three toasts are kept visible at once. */
const MAX_VISIBLE = 3;

const TONE_BORDER: Record<ToastTone, string> = {
  success: 'border-emerald-700/60',
  error: 'border-red-800/70',
  info: 'border-slate-700',
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === 'success') {
    return <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />;
  }
  if (tone === 'error') {
    return <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden="true" />;
  }
  return <Info className="h-4 w-4 text-slate-400" aria-hidden="true" />;
}

/** Hook reading the toast API. Throws when used outside the provider. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error('useToast must be used within <ToastProvider>');
  }
  return api;
}

/**
 * Minimal toast system: transient messages stacked in the bottom-right
 * corner, above the mini-player bar.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef<number[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = nextIdRef.current;
      nextIdRef.current += 1;
      setItems((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, message, tone }]);
      timersRef.current.push(window.setTimeout(() => dismiss(id), TOAST_DURATION_MS));
    },
    [dismiss],
  );

  // Drop every pending timer when the provider goes away.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const api = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        className="pointer-events-none fixed bottom-24 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col items-end gap-2"
        role="status"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={`toast-in pointer-events-auto flex w-full items-start gap-3 rounded-lg border ${TONE_BORDER[item.tone]} bg-slate-900/95 px-4 py-3 shadow-2xl backdrop-blur`}
          >
            <ToneIcon tone={item.tone} />

            <p className="flex-1 text-sm leading-5 text-slate-200">{item.message}</p>

            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Chiudi avviso"
              className="-mr-1 shrink-0 rounded p-0.5 text-slate-500 transition hover:text-slate-200"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}