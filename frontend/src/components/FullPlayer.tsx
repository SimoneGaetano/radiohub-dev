import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  MapPin,
  Music,
  Pause,
  Play,
  Radio,
  Signal,
  Info,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import {
  playStation,
  retryPlayback,
  setVolume,
  togglePlay,
} from '../features/player/playerSlice';
import type { RadioStation } from '../types';
import { useAmbientColor } from '../hooks/useAmbientColor';
import { Equalizer } from './Equalizer';
import { SleepTimer } from './SleepTimer';
import { useFavorite } from '../hooks/useFavorite';
import { fetchRadioInfo } from '../features/posts/postsSlice';
import { RadioInfoDrawer } from './RadioInfoDrawer';
import { PlaybackStatusBadge } from './PlaybackStatusBadge';

interface Props {
  /** Collapses the overlay back down to the bottom bar. */
  onClose: () => void;
}

/** Collapse duration in ms — mirrored from `.fullplayer-out` in `index.css`. */
const CLOSE_MS = 260;

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
  const showImage = station.favicon.trim().length > 0 && !broken;

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
          <Radio className="h-8 w-8 text-accent-text/70" aria-hidden="true" />
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
  const { current, isPlaying, volume, playbackStatus } = useAppSelector(
    (state) => state.player,
  );
  const stations = useAppSelector((state) => state.radios.items);
  const ambientTint = useAmbientColor(current?.favicon ?? '');
  const { isFavorite, toggle } = useFavorite(current);

  const [closing, setClosing] = useState(false);
  const [coverBroken, setCoverBroken] = useState(false);
  /** Whether the "Info AI" drawer is visible over the overlay. */
  const [infoOpen, setInfoOpen] = useState(false);

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

  // Esc dismisses the info drawer first, then the overlay itself.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (infoOpen) {
          setInfoOpen(false);
          return;
        }
        requestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestClose, infoOpen]);

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

  const showCover = current.favicon.trim().length > 0 && !coverBroken;
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
      className={`palette-dark fixed inset-0 z-50 overflow-hidden bg-slate-950 ${
        closing ? 'fullplayer-out' : 'fullplayer-in'
      }`}
    >
      {/* Neutral dark base — also the fallback whenever no colour could be
          extracted from the artwork. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900 to-slate-950 transition-colors duration-200 ease-out" />

      {/* Ambient tint from the artwork. The colour is cleared synchronously
          when the station changes, so the neutral base shows through at once
          and `transition-colors` fades the previous tone away. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-colors duration-200 ease-out"
        style={{
          backgroundColor: ambientTint ?? 'transparent',
          maskImage: 'linear-gradient(165deg, black 0%, transparent 58%)',
          WebkitMaskImage: 'linear-gradient(165deg, black 0%, transparent 58%)',
          opacity: 0.38,
        }}
      />

      <div className="relative z-10 flex h-dvh max-h-dvh flex-col justify-between overflow-hidden p-6">
        <header className="flex shrink-0 items-center justify-between">
          <button
            type="button"
            onClick={requestClose}
            aria-label="Riduci il player a icona"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-500/20 hover:text-slate-50"
          >
            <ChevronDown className="h-6 w-6" aria-hidden="true" />
          </button>

          <span className="inline-flex items-center gap-2 rounded-full border border-slate-500/30 bg-slate-500/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-300">
            <span
              className={`h-2 w-2 rounded-full ${
                isPlaying ? 'bg-accent-soft' : 'bg-slate-500'
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900/70 text-slate-300 transition hover:border-slate-500 hover:text-slate-50 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-600 disabled:hover:border-slate-800"
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

              {/* Fixed, identical cover box for every station, so the artwork's
                  intrinsic size can never shift the layout. */}
              <div className="relative w-60 h-60 sm:w-64 sm:h-64 aspect-square shrink-0 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-slate-500/30">
                {showCover ? (
                  <img
                    key={current.id}
                    src={current.favicon}
                    alt={`Copertina di ${current.name}`}
                    onError={() => setCoverBroken(true)}
                    className="w-full h-full object-cover rounded-2xl"
                  />
                ) : (
                  <div className="flex w-full h-full object-cover rounded-2xl items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                    <Radio
                      className="h-16 w-16 text-slate-400"
                      aria-hidden="true"
                    />
                  </div>
                )}

                <div className="absolute bottom-2 right-2 rounded-full border border-slate-500/30 bg-slate-950/80 px-2.5 py-1.5 backdrop-blur">
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900/70 text-slate-300 transition hover:border-slate-500 hover:text-slate-50 disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/40 disabled:text-slate-600 disabled:hover:border-slate-800"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="w-full max-w-2xl text-center">
              {genre ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-border/60 bg-emerald-950/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-accent-text">
                  <Music className="h-3.5 w-3.5" aria-hidden="true" />
                  {genre}
                </span>
              ) : null}

              <div className="mt-3 flex items-center justify-center gap-3">
                <h1 className="line-clamp-2 text-2xl font-bold leading-tight text-slate-50 sm:text-4xl">
                  {current.name}
                </h1>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={
                    isFavorite
                      ? 'Rimuovi dai preferiti'
                      : 'Aggiungi ai preferiti'
                  }
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition duration-200 hover:bg-slate-500/20 ${
                    isFavorite
                      ? 'fill-rose-500 text-rose-500'
                      : 'border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-slate-50'
                  }`}
                >
                  <Heart className="h-5 w-5" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    // Open the drawer for the station currently playing and
                    // (re)generate its AI bio through the Redux thunk.
                    setInfoOpen(true);
                    void dispatch(
                      fetchRadioInfo({
                        radioId: current.id,
                        radioName: current.name,
                        country: current.country || undefined,
                        tags: current.tags,
                      }),
                    );
                  }}
                  aria-label={`Info AI su ${current.name}`}
                  title="Info AI"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-slate-500/20 hover:text-slate-50"
                >
                  <Info className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              {/* F2 status indicator: connecting, live or broken stream. */}
              <div className="mt-3 flex justify-center">
                <PlaybackStatusBadge
                  status={playbackStatus}
                  onRetry={() => dispatch(retryPlayback())}
                />
              </div>

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
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-slate-500/20 hover:text-slate-50"
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

            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => dispatch(togglePlay())}
                aria-label={isPlaying ? 'Pausa' : 'Riproduci'}
                className="flex h-15 w-15 items-center justify-center rounded-full bg-accent text-on-accent shadow-xl transition hover:bg-accent-soft active:scale-95"
              >
                {isPlaying ? (
                  <Pause className="h-9 w-9" aria-hidden="true" />
                ) : (
                  <Play className="h-9 w-9" aria-hidden="true" />
                )}
              </button>

              <SleepTimer />
            </div>
          </div>
        </footer>
      </div>

      {/* Info AI drawer: opened by the info button, shows the AI bio of
          the station currently in play (loading / success / error states). */}
      <RadioInfoDrawer
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        fallbackName={current.name}
      />
    </div>
  );
}
