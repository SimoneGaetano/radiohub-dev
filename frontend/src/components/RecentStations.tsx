import { Clock, Radio, Trash2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import {
  clearRecents,
  clearServerRecents,
  playStation,
} from '../features/player/playerSlice';
import type { RadioStation } from '../types';
import { useToast } from './Toast';

/**
 * Horizontal strip with the last played stations (max 10).
 * Hidden while empty; every entry replays through `playStation`.
 */
export function RecentStations() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { recentIds, recentStations, current } = useAppSelector(
    (state) => state.player,
  );

  const stations = recentIds
    .map((id) => recentStations[id])
    .filter((station): station is RadioStation => station !== undefined);

  if (stations.length === 0) {
    return null;
  }

  const handleClear = () => {
    dispatch(clearRecents());
    // Signed-in users also clear the server-side history (best effort).
    void dispatch(clearServerRecents());
    showToast('Cronologia degli ascolti svuotata', 'info');
  };

  return (
    <section aria-label="Ascoltate di recente" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
          Ascoltate di recente
        </h2>
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-1.5 rounded-full border border-slate-800 px-3 py-1 text-xs font-medium text-slate-400 transition hover:text-slate-200"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          Svuota
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 pt-2.5">
        {stations.map((station) => {
          const isCurrent = current?.id === station.id;
          return (
            <button
              key={station.id}
              type="button"
              onClick={() => dispatch(playStation(station))}
              title={station.name}
              aria-label={`Riascolta ${station.name}`}
              className="flex w-20 shrink-0 flex-col items-center gap-1.5 text-center"
            >
              <span
                className={`relative block h-14 w-14 overflow-hidden rounded-lg bg-slate-800 ${
                  isCurrent ? 'ring-2 ring-accent-border' : ''
                }`}
              >
                <Radio
                  className="absolute inset-0 m-auto h-5 w-5 text-slate-500"
                  aria-hidden="true"
                />
                {station.favicon.trim() ? (
                  <img
                    src={station.favicon}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden';
                    }}
                  />
                ) : null}
              </span>
              <span className="w-full truncate text-xs text-slate-300">
                {station.name}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
