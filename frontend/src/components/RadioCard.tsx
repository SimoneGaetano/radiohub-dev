import { Heart, Info, Pause, Play, Radio, Share2 } from 'lucide-react';
import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { playStation, togglePlay } from '../features/player/playerSlice';
import { useFavorite } from '../hooks/useFavorite';
import type { RadioStation } from '../types';
import { useToast } from './Toast';
import { fetchRadioInfo } from '../features/posts/postsSlice';
import { RadioInfoDrawer } from './RadioInfoDrawer';

interface Props {
  station: RadioStation;
}

/** Copies text via the Clipboard API, with a legacy fallback for older browsers. */
async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  document.body.removeChild(area);
}

export function RadioCard({ station }: Props) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { current, isPlaying } = useAppSelector((state) => state.player);
  const { isFavorite, toggle } = useFavorite(station);
  /** Whether the Info AI drawer is visible for this card. */
  const [infoOpen, setInfoOpen] = useState(false);

  const isCurrent = current?.id === station.id;
  const isActive = isCurrent && isPlaying;

  const handleToggle = () => {
    if (isCurrent) {
      dispatch(togglePlay());
    } else {
      dispatch(playStation(station));
    }
  };

  const handleShare = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    // Keep the card toggle from firing: the share button must not start playback.
    event.stopPropagation();
    try {
      await copyToClipboard(station.url);
      showToast(`Link di “${station.name}” copiato negli appunti`, 'success');
    } catch {
      showToast('Impossibile copiare il link negli appunti', 'error');
    }
  };

  return (
    <>
    <article
      onClick={handleToggle}
      role="button"
      tabIndex={0}
      aria-label={
        isActive ? `Metti in pausa ${station.name}` : `Ascolta ${station.name}`
      }
      onKeyDown={(event) => {
        // Keyboard equivalent of the card click (WCAG 2.1.1). The guard stops
        // the nested controls (play, heart, share, info) from toggling twice:
        // their own key events bubble up to this handler.
        if (event.target !== event.currentTarget) {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleToggle();
        }
      }}
      className="flex cursor-pointer gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 transition hover:border-slate-700"
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-800">
        {station.favicon.trim() ? (
          <img
            src={station.favicon}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.visibility = 'hidden';
            }}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-slate-700/60">
            <Radio className="h-5 w-5 text-slate-500" aria-hidden="true" />
          </span>
        )}
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
          <p className="mt-1 truncate text-[11px] text-slate-400">
            {station.tags.slice(0, 4).join(', ')}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-start gap-1.5">
        <button
          type="button"
          onClick={(event) => {
            // Favouriting must not start playback: stop the card toggle.
            event.stopPropagation();
            toggle();
          }}
          aria-pressed={isFavorite}
          aria-label={
            isFavorite
              ? `Rimuovi ${station.name} dai preferiti`
              : `Aggiungi ${station.name} ai preferiti`
          }
          title={isFavorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-slate-500/20 ${
            isFavorite ? 'text-rose-500' : 'text-slate-400 hover:text-rose-300'
          }`}
        >
          <Heart
            className={`h-4 w-4 ${isFavorite ? 'fill-rose-500' : ''}`}
            aria-hidden="true"
          />
        </button>

        <button
          type="button"
          onClick={handleShare}
          aria-label={`Copia il link di ${station.name}`}
          title="Copia link"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-500/20 hover:text-slate-200"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={(event) => {
            // Open only the AI info: the click must not bubble to the card,
            // otherwise handleToggle would start/pause playback underneath.
            event.stopPropagation();
            event.preventDefault();
            setInfoOpen(true);
            void dispatch(
              fetchRadioInfo({
                radioId: station.id,
                radioName: station.name,
                country: station.country || undefined,
                tags: station.tags,
              }),
            );
          }}
          aria-label={`Info AI su ${station.name}`}
          title="Info AI"
          className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-slate-500/20 hover:text-slate-50"
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </button>

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
              ? 'flex h-9 w-9 items-center justify-center rounded-full bg-accent text-on-accent transition hover:bg-accent-soft'
              : 'flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-slate-200 transition hover:bg-slate-700'
          }
        >
          {isActive ? (
            <Pause className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </article>

      {/* Info AI drawer: the popup also opens from the grid cards, not only
          from the full-screen player. */}
      <RadioInfoDrawer
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        fallbackName={station.name}
      />
    </>
  );
}