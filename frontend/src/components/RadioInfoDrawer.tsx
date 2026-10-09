import { Info, Loader2, X } from 'lucide-react';
import { useEffect } from 'react';
import { useAppSelector } from '../app/hooks';

interface Props {
  /** Whether the drawer is visible. */
  open: boolean;
  /** Closes the drawer (backdrop click, ✕ button, Esc). */
  onClose: () => void;
  /** Station name shown while the bio is still loading. */
  fallbackName: string;
}

/**
 * Modal drawer showing the AI-generated bio of a station (loading, success
 * and error states). Shared by the grid card (`RadioCard`) and the full-screen
 * player (`FullPlayer`), so the Info AI popup works in both places.
 */
export function RadioInfoDrawer({ open, onClose, fallbackName }: Props) {
  const { radioInfo, radioInfoLoading, error } = useAppSelector(
    (state) => state.posts,
  );

  // Esc closes the drawer — and must not reach the full-screen player below.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/80 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Informazioni AI su ${radioInfo?.data.radioName ?? fallbackName}`}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-400">
                Info AI
              </p>
              <h2 className="truncate text-sm font-semibold text-slate-100">
                {radioInfo?.data.radioName ?? fallbackName}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi le informazioni AI"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-500/20 hover:text-slate-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {radioInfoLoading ? (
          <div className="flex items-center gap-3 py-6 text-sm text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Generazione biografia in corso…
          </div>
        ) : radioInfo ? (
          <p className="text-sm leading-relaxed text-slate-200">
            {radioInfo.data.bio}
          </p>
        ) : error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <p className="text-sm text-slate-400">
            Nessuna informazione disponibile per questa radio.
          </p>
        )}
      </div>
    </div>
  );
}