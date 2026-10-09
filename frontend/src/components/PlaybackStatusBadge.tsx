import { Loader2, RefreshCw } from 'lucide-react';
import type { PlaybackStatus } from '../types';

interface Props {
  /** Stream state from the player slice; `idle` renders nothing at all. */
  status: PlaybackStatus;
  /** When provided, the error state shows a "Riprova" button. */
  onRetry?: () => void;
  /** Shorter labels for the bottom bar. */
  compact?: boolean;
  className?: string;
}

/**
 * F2 status indicator ("live", buffering, errore di riproduzione) shared by the
 * bottom bar and the full-screen player. It answers the question a silent
 * speaker raises: is the station connecting, playing, or broken?
 * The state is announced to screen readers (F5, `aria-live="polite"`).
 */
export function PlaybackStatusBadge({
  status,
  onRetry,
  compact = false,
  className = '',
}: Props) {
  if (status === 'idle') {
    return null;
  }

  if (status === 'buffering') {
    return (
      <span
        role="status"
        aria-live="polite"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300 ${className}`}
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        {compact ? 'Connessione…' : 'Buffering…'}
      </span>
    );
  }

  if (status === 'live') {
    return (
      <span
        role="status"
        aria-live="polite"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent-border/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-accent-text ${className}`}
      >
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-soft"
          aria-hidden="true"
        />
        LIVE
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-300 mt-1 ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
      {compact ? 'Errore' : 'Errore di riproduzione'}
      {onRetry ? (
        <button
          type="button"
          onClick={(event) => {
            // The bar itself is clickable: never let the retry bubble up.
            event.stopPropagation();
            onRetry();
          }}
          aria-label="Riprova a riprodurre la stazione"
          title="Riprova"
          className="ml-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold text-red-100 transition hover:bg-red-500/20 hover:text-slate-50"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Riprova
        </button>
      ) : null}
    </span>
  );
}
