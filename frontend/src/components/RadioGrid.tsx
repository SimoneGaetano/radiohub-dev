import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useAppSelector } from '../app/hooks';
import { GenrePills } from './GenrePills';
import { RadioCard } from './RadioCard';
import { RadioSkeleton } from './RadioSkeleton';

/** Skeleton cards shown while the first page is still loading. */
const SKELETON_COUNT = 9;

export function RadioGrid() {
  const { items, status, error, cache, query } = useAppSelector(
    (state) => state.radios,
  );

  // The pills are server-backed, so `items` already is the filtered list.
  const stations = items;

  // The backend still sends `X-Cache`: keep it out of the UI and log it in dev.
  useEffect(() => {
    if (import.meta.env.DEV && cache) {
      console.debug(`[radios] X-Cache: ${cache}`);
    }
  }, [cache]);

  if (status === 'loading' && items.length === 0) {
    return (
      <div role="status" aria-label="Caricamento delle radio">
        <span className="sr-only">Caricamento delle radio…</span>
        <div
          aria-hidden="true"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <RadioSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="space-y-3">
        <GenrePills />
        <div className="flex items-start gap-3 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            <strong className="block font-semibold">
              Errore durante la ricerca
            </strong>
            {error}
          </span>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <GenrePills />
        <div className="rounded-lg border border-dashed border-slate-800 py-12 text-center text-sm text-slate-400">
          Nessuna radio trovata{query ? ` per “${query}”` : ''}.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <GenrePills />
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span>{stations.length} risultati</span>
        {status === 'loading' && (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        )}
      </div>

      {stations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-800 py-12 text-center text-sm text-slate-400">
          Nessuna radio trovata per questo filtro. Prova con “Tutti”.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((station) => (
            <RadioCard key={station.id} station={station} />
          ))}
        </div>
      )}
    </div>
  );
}
