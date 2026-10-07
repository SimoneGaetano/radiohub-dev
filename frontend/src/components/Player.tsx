import Hls from 'hls.js';
import { ChevronUp, Pause, Play, Volume2, X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import {
  clearPlayer,
  setExpanded,
  setVolume,
  stopPlayback,
  togglePlay,
} from '../features/player/playerSlice';
import { FullPlayer } from './FullPlayer';

export function Player() {
  const dispatch = useAppDispatch();
  const { current, isPlaying, volume, expanded } = useAppSelector(
    (state) => state.player,
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const openFullPlayer = useCallback(
    () => dispatch(setExpanded(true)),
    [dispatch],
  );
  const closeFullPlayer = useCallback(
    () => dispatch(setExpanded(false)),
    [dispatch],
  );
  const dismissPlayer = useCallback(() => dispatch(clearPlayer()), [dispatch]);

  // The bar opens the overlay, but the play and volume controls must not
  // bubble up — otherwise interacting with them would open it by accident.
  const stopBubble = (event: ReactMouseEvent<HTMLDivElement>) =>
    event.stopPropagation();

  // Attach the stream: HLS sources go through hls.js, everything else uses the
  // native audio element.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) {
      return;
    }

    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (current.url.includes('.m3u8') && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(current.url);
      hls.attachMedia(audio);
      hlsRef.current = hls;
    } else {
      audio.src = current.url;
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [current]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (isPlaying) {
      void audio.play().catch(() => {
        dispatch(stopPlayback());
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, dispatch]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);

  if (!current) {
    return null;
  }

  return (
    <>
      <div
        onClick={openFullPlayer}
        className="fixed inset-x-0 bottom-0 z-40 cursor-pointer border-t border-slate-800 bg-slate-950/95 backdrop-blur transition hover:bg-slate-900/95"
      >
        <audio ref={audioRef} className="hidden" />

        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              dispatch(togglePlay());
            }}
            aria-label={isPlaying ? 'Pausa' : 'Riproduci'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-slate-950 transition hover:bg-emerald-400"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Play className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-100">
              {current.name}
            </p>
            <p className="truncate text-xs text-slate-400">
              {[current.country, current.language].filter(Boolean).join(' · ') ||
                '—'}
              {current.bitrate > 0 ? ` · ${current.bitrate} kbps` : ''}
            </p>
          </div>

          <div
            onClick={stopBubble}
            className="hidden items-center gap-2 sm:flex"
          >
            <Volume2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(volume * 100)}
              onChange={(event) =>
                dispatch(setVolume(Number(event.target.value) / 100))
              }
              aria-label="Volume"
              className="h-1 w-28 cursor-pointer accent-emerald-500"
            />
          </div>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openFullPlayer();
            }}
            aria-label="Apri il player a schermo intero"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <ChevronUp className="h-5 w-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={(event) => {
              // Stop bubbling: the bar itself opens the full-screen overlay,
              // so without this the player would reopen while closing.
              event.stopPropagation();
              dismissPlayer();
            }}
            aria-label="Chiudi completamente il player"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {expanded ? <FullPlayer onClose={closeFullPlayer} /> : null}
    </>
  );
}