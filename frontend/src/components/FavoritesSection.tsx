import { Heart, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { clearFavorites } from '../features/player/playerSlice';
import { RadioCard } from './RadioCard';
import { useToast } from './Toast';
import type { RadioStation } from '../types';

/**
 * Ordered list of favourite stations.
 *
 * `favoriteStations` is the persisted map holding the **full station objects**,
 * so this view is complete: unlike a filter over the current search results, a
 * favourite that is not in the latest `GET /api/radios` response still shows up
 * (F4: dedicated favourites view).
 */
function orderedFavorites(
  ids: string[],
  stations: Record<string, RadioStation>,
): RadioStation[] {
  return ids
    .map((id) => stations[id])
    .filter((station): station is RadioStation => station !== undefined);
}

/**
 * Dedicated favourites section (F4). Rendered from the persisted store, so it
 * never depends on the current search: what the user saved is always visible.
 * Cards are the same `RadioCard` used by the grid, so look and behaviour
 * (play/pause, heart, share, Info AI) are identical everywhere.
 */
export function FavoritesSection() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { favoriteIds, favoriteStations } = useAppSelector(
    (state) => state.player,
  );
  /** Signed-in users get the account library; guests stay on the device. */
  const signedIn = useAppSelector((state) => state.auth.token !== null);
  /** Two-step confirmation for the destructive action (no native dialog). */
  const [confirmingClear, setConfirmingClear] = useState(false);

  const stations = useMemo(
    () => orderedFavorites(favoriteIds, favoriteStations),
    [favoriteIds, favoriteStations],
  );

  const handleClear = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      window.setTimeout(() => setConfirmingClear(false), 4000);
      return;
    }
    setConfirmingClear(false);
    void dispatch(clearFavorites());
    showToast('Preferiti svuotati', 'info');
  };

  return (
    <section id="preferiti" className="scroll-mt-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Heart
            className="h-5 w-5 fill-rose-500 text-rose-500"
            aria-hidden="true"
          />
          I tuoi preferiti
        </h2>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300">
          {stations.length}
        </span>
        <span className="text-xs text-slate-400">
          {signedIn ? 'Sincronizzati con l’account' : 'Su questo dispositivo'}
        </span>

        {stations.length > 0 ? (
          <button
            type="button"
            onClick={handleClear}
            className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition ${
              confirmingClear
                ? 'border-rose-500 bg-rose-500/10 text-rose-200'
                : 'border-slate-700 text-slate-300 hover:border-rose-500 hover:text-rose-300'
            }`}
            aria-label="Svuota tutti i preferiti"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {confirmingClear ? 'Confermi?' : 'Svuota preferiti'}
          </button>
        ) : null}
      </div>

      {stations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-800 py-8 text-center text-sm text-slate-400">
          Nessun preferito per ora: tocca il ❤️ su una stazione (dalla griglia o
          dal player) e la ritroverai qui.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((station) => (
            <RadioCard key={station.id} station={station} />
          ))}
        </div>
      )}
    </section>
  );
}
