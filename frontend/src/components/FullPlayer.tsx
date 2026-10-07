import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Music,
  Pause,
  Play,
  Radio,
  Signal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import {
  playStation,
  setVolume,
  togglePlay,
} from '../features/player/playerSlice';
import type { RadioStation } from '../types';

interface Props {
  /** Collapses the overlay back down to the bottom bar. */
  onClose: () => void;
}

/** Collapse duration in ms — mirrored from `.fullplayer-out` in `index.css`. */
const CLOSE_MS = 260;

/** Animated equaliser badge; static while the stream is paused. */
function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className="flex h-5 items-end gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <span
          key={index}
          style={{
            animationDelay: `${index * 130}ms`,
            height: `${55 + index * 15}%`,
          }}
          className={`w-[3px] rounded-full bg-emerald-400 ${
            playing ? 'eq-bar' : ''
          }`}
        />
      ))}
    </span>
  );
}

/** Shared look of the faded previous/next previews shown from `md` up. */
const PREVIEW_CLASSES =
  'opacity-40 scale-75 blur-[1px] hover:opacity-80 transition-all cursor-pointer';

/** Faded, clickable thumbnail of the neighbouring station (md screens and up). */
function StationPreview({
  station,
  onSelect,
  label,
}: {
  station: RadioStation;
  onSelect: () => void;
  label: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = station.favicon.length > 0 && !broken;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={label}
      className={`hidden h-28 w-28 shrink-0 overflow-hidden rounded-2xl md:block ${PREVIEW_CLASSES}`}
    >
      {showImage ? (
        <img
          src={station.favicon}
          alt=""
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-slate-800">
          <Radio className="h-8 w-8 text-emerald-400/70" aria-hidden="true" />
        </span>
      )}
    </button>
  );
}

/**
 * Spotify-style full-screen player overlay, opened from the bottom bar.
 */
export function FullPlayer({ onClose }: Props) {
  const dispatch = useAppDispatch();
  const { current, isPlaying, volume } = useAppSelector(
    (state) => state.player,
  );
  const stations = useAppSelector((state) => state.radios.items);

  const [closing, setClosing] = useState(false);
  const [coverBroken, setCoverBroken] = useState(false);

  const closeTimerRef = useRef<number | null>(null);
  const lastVolumeRef = useRef(0.8);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  /** Plays the collapse animation, then minimises the overlay (also on Esc). */
  const requestClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      return;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onCloseRef.current();
    }, CLOSE_MS);
  }, []);

  // Esc dismisses the overlay.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestClose]);

  // Freeze the page behind the overlay and drop any pending timer on unmount.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  // Switching station must start from a clean cover/fallback state.
  const stationId = current?.id;
  useEffect(() => {
    setCoverBroken(false);
  }, [stationId]);

  if (!current) {
    return null;
  }

  const showCover = current.favicon.length > 0 && !coverBroken;
  const genre = current.tags[0];

  const toggleMute = () => {
    if (volume > 0) {
      lastVolumeRef.current = volume;
      dispatch(setVolume(0));
    } else {
      dispatch(
        setVolume(lastVolumeRef.current > 0 ? lastVolumeRef.current : 0.8),
      );
    }
  };

  // Linear navigation: no wrap-around. The first station has no previous one
  // and the last one has no next, so those controls are disabled instead of
  // looping back to the other end of the list.
  const currentIndex = stations.findIndex(
    (station) => station.id === current.id,
  );
  const previousStation: RadioStation | null =
    currentIndex > 0 ? stations[currentIndex - 1] : null;
  const nextStation: RadioStation | null =
    currentIndex >= 0 && currentIndex < stations.length - 1
      ? stations[currentIndex + 1]
      : null;

  const playPrevious = () => {
    if (previousStation) {
      dispatch(playStation(previousStation));
    }
  };

  const playNext = () => {
    if (nextStation) {
      dispatch(playStation(nextStation));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Player a schermo intero: ${current.name}`}
      className={`fixed inset-0 z-50 overflow-hidden bg-slate-950 ${
        closing ? 'fullplayer-out' : 'fullplayer-in'
      }`}
    >
      {/* Dynamic background: the station cover blurred into a gradient. */}
      {showCover && (
        <img
          src={current.favicon}
          alt=""
          aria-hidden="true"
          onError={() => setCoverBroken(true)}
          className="pointer-events-none absolute left-1/2 top-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2 object-cover opacity-50 blur-[90px]"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-950/85 to-slate-950 backdrop-blur-2xl" />

      <div className="relative z-10 flex h-dvh max-h-dvh flex-col justify-between overflow-hidden p-6">
        <header className="flex shrink-0 items-center justify-between">
          <button
            type="button"
            onClick={requestClose}
            aria-label="Riduci il player a icona"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <ChevronDown className="h-6 w-6" aria-hidden="true" />
          </button>

          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-300">
            <span
              className={`h-2 w-2 rounded-full ${
                isPlaying ? 'bg-emerald-400' : 'bg-slate-500'
              }`}
              aria-hidden="true"
            />
            {isPlaying ? 'In riproduzione' : 'In pausa'}
          </span>

          {/* Optical counterweight so the status pill stays centred. */}
          <span className="h-11 w-11" aria-hidden="true" />
        </header>

        <main className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto my-auto">
          {/* The auto margins centre the block when it fits and collapse to
              zero when it does not, so a short window can scroll from the
              top while header and footer stay pinned. */}
          <div className="my-auto flex w-full flex-col items-center gap-4">
            <div className="w-full max-w-md sm:max-w-lg md:max-w-2xl mx-auto flex items-center justify-between gap-3 px-2 sm:px-4">
              <button
                type="button"
                onClick={playPrevious}
                disabled={!previousStation}
                aria-label="Riproduci la radio precedente"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900/70 text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-600 disabled:hover:border-slate-800"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>

              {previousStation ? (
                <StationPreview
                  station={previousStation}
                  onSelect={playPrevious}
                  label="Riproduci la radio precedente"
                />
              ) : (
                // Empty slot keeps the row symmetric so the cover stays centred.
                <span
                  className="hidden h-28 w-28 shrink-0 md:block"
                  aria-hidden="true"
                />
              )}

              {/* Cover capped at 30vh so header, info and controls fit. */}
              <div className="relative flex max-h-[30vh] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 shadow-2xl ring-1 ring-white/10">
                {showCover ? (
                  <img
                    src={current.favicon}
                    alt={`Copertina di ${current.name}`}
                    onError={() => setCoverBroken(true)}
                    className="aspect-square max-h-[30vh] w-auto object-cover"
                  />
                ) : (
                  <div className="flex h-[30vh] w-[30vh] items-center justify-center bg-gradient-to-br from-emerald-900/70 to-slate-900">
                    <Radio
                      className="h-16 w-16 text-emerald-400/70"
                      aria-hidden="true"
                    />
                  </div>
                )}

                <div className="absolute bottom-2 right-2 rounded-full border border-white/10 bg-slate-950/80 px-2.5 py-1.5 backdrop-blur">
                  <Equalizer playing={isPlaying} />
                </div>
              </div>

              {nextStation ? (
                <StationPreview
                  station={nextStation}
                  onSelect={playNext}
                  label="Riproduci la radio successiva"
                />
              ) : (
                // Empty slot keeps the row symmetric so the cover stays centred.
                <span
                  className="hidden h-28 w-28 shrink-0 md:block"
                  aria-hidden="true"
                />
              )}

              <button
                type="button"
                onClick={playNext}
                disabled={!nextStation}
                aria-label="Riproduci la radio successiva"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900/70 text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-600 disabled:hover:border-slate-800"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="w-full max-w-2xl text-center">
              {genre ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/60 bg-emerald-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-emerald-300">
                  <Music className="h-3.5 w-3.5" aria-hidden="true" />
                  {genre}
                </span>
              ) : null}

              <h1 className="mt-3 line-clamp-2 text-2xl font-bold leading-tight text-white sm:text-4xl">
                {current.name}
              </h1>

              <p className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-slate-300">
                {current.country ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin
                      className="h-4 w-4 text-slate-400"
                      aria-hidden="true"
                    />
                    {current.country}
                  </span>
                ) : null}
                {current.bitrate > 0 ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Signal
                      className="h-4 w-4 text-slate-400"
                      aria-hidden="true"
                    />
                    {current.bitrate} kbps
                  </span>
                ) : null}
                {current.codec ? <span>{current.codec}</span> : null}
                {current.language ? <span>{current.language}</span> : null}
              </p>
            </div>
          </div>
        </main>

        <footer className="shrink-0 px-6 pb-7 pt-2">
          <div className="mx-auto w-full max-w-xl">
            {/* Volume slider with an icon that toggles mute. */}
            <div className="mb-6 flex items-center gap-4">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={
                  volume > 0 ? "Disattiva l'audio" : "Riattiva l'audio"
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                {volume > 0 ? (
                  <Volume2 className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <VolumeX className="h-5 w-5" aria-hidden="true" />
                )}
              </button>

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
                className="h-2 w-full cursor-pointer accent-emerald-500"
              />

              <span className="w-11 shrink-0 text-right text-xs tabular-nums text-slate-400">
                {Math.round(volume * 100)}%
              </span>
            </div>

            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => dispatch(togglePlay())}
                aria-label={isPlaying ? 'Pausa' : 'Riproduci'}
                className="flex h-15 w-15 items-center justify-center rounded-full bg-emerald-500 text-slate-950 shadow-xl transition hover:bg-emerald-400 active:scale-95"
              >
                {isPlaying ? (
                  <Pause className="h-9 w-9" aria-hidden="true" />
                ) : (
                  <Play className="h-9 w-9" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
