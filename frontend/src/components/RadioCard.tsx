import { Pause, Play } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { playStation, togglePlay } from '../features/player/playerSlice';
import type { RadioStation } from '../types';

interface Props {
  station: RadioStation;
}

export function RadioCard({ station }: Props) {
  const dispatch = useAppDispatch();
  const { current, isPlaying } = useAppSelector((state) => state.player);

  const isCurrent = current?.id === station.id;
  const isActive = isCurrent && isPlaying;

  const handleToggle = () => {
    if (isCurrent) {
      dispatch(togglePlay());
    } else {
      dispatch(playStation(station));
    }
  };

  return (
    <article
      onClick={handleToggle}
      className="flex cursor-pointer gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 transition hover:border-slate-700"
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-800">
        <img
          src={station.favicon}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden';
          }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <h3
          className="truncate text-sm font-semibold text-slate-100"
          title={station.name}
        >
          {station.name}
        </h3>
        <p className="truncate text-xs text-slate-400">
          {[station.country, station.language].filter(Boolean).join(' · ') || '—'}
        </p>
        {station.tags.length > 0 && (
          <p className="mt-1 truncate text-[11px] text-slate-500">
            {station.tags.slice(0, 4).join(', ')}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={(event) => {
          // Stop the click from reaching the card, otherwise handleToggle
          // would fire twice and cancel itself out.
          event.stopPropagation();
          handleToggle();
        }}
        aria-label={isActive ? `Pausa ${station.name}` : `Riproduci ${station.name}`}
        className={
          isActive
            ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-slate-950 transition hover:bg-emerald-400'
            : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-200 transition hover:bg-slate-700'
        }
      >
        {isActive ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </article>
  );
}