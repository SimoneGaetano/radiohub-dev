import { AlertTriangle, Loader2 } from 'lucide-react';
import { useAppSelector } from '../app/hooks';
import { RadioCard } from './RadioCard';

export function RadioGrid() {
  const { items, status, error, cache, query } = useAppSelector(
    (state) => state.radios,
  );

  if (status === 'loading' && items.length === 0) {
    return (
      <div className="flex items-center gap-3 py-12 text-sm text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Caricamento delle radio…
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="block font-semibold">Errore durante la ricerca</strong>
          {error}
        </span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 py-12 text-center text-sm text-slate-400">
        Nessuna radio trovata{query ? ` per “${query}”` : ''}.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span>{items.length} risultati</span>
        {cache && (
          <span
            className={
              cache === 'HIT'
                ? 'rounded-full border border-emerald-800 bg-emerald-950/60 px-2 py-0.5 font-medium text-emerald-300'
                : 'rounded-full border border-amber-800 bg-amber-950/60 px-2 py-0.5 font-medium text-amber-300'
            }
          >
            X-Cache: {cache}
          </span>
        )}
        {status === 'loading' && (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((station) => (
          <RadioCard key={station.id} station={station} />
        ))}
      </div>
    </div>
  );
}