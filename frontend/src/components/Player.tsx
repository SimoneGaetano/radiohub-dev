import Hls from 'hls.js';
import { ChevronUp, Pause, Play, Volume2, X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import {
  clearPlayer,
  expireSleepTimer,
  playbackFailed,
  playStation,
  pushRecentPlay,
  retryPlayback,
  setExpanded,
  setPlaybackStatus,
  setVolume,
  togglePlay,
} from '../features/player/playerSlice';
import type { RadioStation } from '../types';
import { useToast } from './Toast';
import { Equalizer } from './Equalizer';
import { SleepTimer } from './SleepTimer';
import { FullPlayer } from './FullPlayer';
import { PlaybackStatusBadge } from './PlaybackStatusBadge';

/** How long to wait for the first audio sample before declaring the stream dead. */
const CONNECT_TIMEOUT_MS = 12_000;

/**
 * Delay of the single automatic retry. Several Icecast/Shoutcast servers refuse
 * the very first connection (listener cap, cold cache) and accept the next one:
 * this is why manually clicking a station a second time used to "fix" it.
 */
const RETRY_DELAY_MS = 1_200;

/** HLS manifests end with `.m3u8`, optionally followed by a query or hash. */
function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|#|$)/i.test(url);
}

export function Player() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const {
    current,
    isPlaying,
    volume,
    expanded,
    sleepEndsAt,
    playbackStatus,
    attempt,
  } = useAppSelector((state) => state.player);
  const stations = useAppSelector((state) => state.radios.items);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  /** Token of the play attempt in progress: stale async results are ignored. */
  const attemptTokenRef = useRef(0);
  /** The error toast is shown once per attempt cycle, not once per code path. */
  const failureShownRef = useRef(false);
  /** Pending "the stream never started" timer. */
  const connectTimerRef = useRef<number | null>(null);
  /** Latest playback flag, readable from async retry callbacks. */
  const isPlayingRef = useRef(isPlaying);
  /** Re-attempts the current station after an error (status indicator button). */
  const handleRetry = useCallback(() => dispatch(retryPlayback()), [dispatch]);

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

  // Mirror the flag so async retry callbacks always read the current value.
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const clearConnectTimer = useCallback(() => {
    if (connectTimerRef.current !== null) {
      window.clearTimeout(connectTimerRef.current);
      connectTimerRef.current = null;
    }
  }, []);

  /**
   * Declares the stream broken: the indicator turns red and the user gets ONE
   * toast per attempt, however many error paths fire (media `error`, hls.js
   * fatal error, failed `play()`, connect timeout).
   */
  const reportFailure = useCallback(
    (token: number) => {
      if (token !== attemptTokenRef.current || failureShownRef.current) {
        return;
      }
      failureShownRef.current = true;
      clearConnectTimer();
      dispatch(playbackFailed());
      showToast(
        `Impossibile avviare “${current?.name ?? 'la stazione'}”: il flusso audio non risponde`,
        'error',
      );
    },
    [clearConnectTimer, dispatch, showToast, current?.name],
  );

  // Attach the stream: HLS sources go through hls.js, everything else uses the
  // native audio element. `attempt` re-runs this effect to reload the source
  // (resume and retry must open a fresh connection on a live stream).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) {
      return;
    }

    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (isHlsUrl(current.url) && Hls.isSupported()) {
      const hls = new Hls();
      // hls.js already retries non-fatal errors internally: fatal is final.
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          reportFailure(attemptTokenRef.current);
        }
      });
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
  }, [current, attempt, reportFailure]);

  // Media events drive the F2 status indicator: `playing` means the audio is
  // really flowing (LIVE), `waiting`/`stalled` that the buffer ran dry.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handlePlaying = () => {
      clearConnectTimer();
      failureShownRef.current = false;
      dispatch(setPlaybackStatus('live'));
    };
    const handleBuffering = () => {
      if (!isPlayingRef.current) {
        return;
      }
      dispatch(setPlaybackStatus('buffering'));
      // Re-arm the watchdog: a stream that stalls after starting must not stay
      // on "Connessione…" forever — it resolves to LIVE or to the error state.
      clearConnectTimer();
      connectTimerRef.current = window.setTimeout(() => {
        reportFailure(attemptTokenRef.current);
      }, CONNECT_TIMEOUT_MS);
    };
    const handleError = () => {
      if (isPlayingRef.current) {
        reportFailure(attemptTokenRef.current);
      }
    };

    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('waiting', handleBuffering);
    audio.addEventListener('stalled', handleBuffering);
    audio.addEventListener('error', handleError);
    return () => {
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('waiting', handleBuffering);
      audio.removeEventListener('stalled', handleBuffering);
      audio.removeEventListener('error', handleError);
    };
  }, [current, dispatch, clearConnectTimer, reportFailure]);

  /**
   * Starts the stream and handles the failure modes of live radio:
   * - `AbortError` means a newer load superseded this `play()`: harmless, so it
   *   is ignored (it used to raise the misleading "stream not responding" toast
   *   when switching station while the previous one was still connecting);
   * - any other rejection gets ONE automatic retry (reload + play again), which
   *   is exactly what the user used to do by clicking the station twice;
   * - if the retry fails, or no audio arrives within `CONNECT_TIMEOUT_MS`, the
   *   stream is declared broken → red indicator + toast.
   */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!isPlaying) {
      // A pause invalidates pending retries: they must not resume playback.
      attemptTokenRef.current += 1;
      clearConnectTimer();
      audio.pause();
      return;
    }

    const token = attemptTokenRef.current + 1;
    attemptTokenRef.current = token;
    failureShownRef.current = false;
    dispatch(setPlaybackStatus('buffering'));

    clearConnectTimer();
    connectTimerRef.current = window.setTimeout(() => {
      reportFailure(token);
    }, CONNECT_TIMEOUT_MS);

    const playOnce = async (isRetry: boolean): Promise<void> => {
      try {
        await audio.play();
      } catch (error) {
        if (token !== attemptTokenRef.current) {
          return; // superseded by a newer attempt: stay silent
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          return; // benign: a new load request interrupted this play()
        }
        if (!isRetry) {
          window.setTimeout(() => {
            if (token !== attemptTokenRef.current || !isPlayingRef.current) {
              return;
            }
            audio.load();
            void playOnce(true);
          }, RETRY_DELAY_MS);
          return;
        }
        reportFailure(token);
      }
    };

    void playOnce(false);
  }, [isPlaying, attempt, dispatch, clearConnectTimer, reportFailure]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);

  // Sleep timer: a single timeout fires the stop at `sleepEndsAt`.
  // Re-armed whenever the deadline changes; paused audio still expires.
  useEffect(() => {
    if (sleepEndsAt === null) {
      return;
    }
    const delay = sleepEndsAt - Date.now();
    if (delay <= 0) {
      dispatch(expireSleepTimer());
      showToast('Timer scaduto: riproduzione fermata', 'info');
      return;
    }
    const id = window.setTimeout(() => {
      dispatch(expireSleepTimer());
      showToast('Timer scaduto: riproduzione fermata', 'info');
    }, delay);
    return () => window.clearTimeout(id);
  }, [sleepEndsAt, dispatch, showToast]);

  /**
   * Computes the neighbour of the current station in list order.
   * Bounds are linear: `null` at the edges (no wrap-around).
   */
  const findNeighbour = useCallback(
    (station: RadioStation | null, direction: 1 | -1): RadioStation | null => {
      if (!station || stations.length === 0) {
        return null;
      }
      const index = stations.findIndex((entry) => entry.id === station.id);
      if (index < 0) {
        return null;
      }
      return stations[index + direction] ?? null;
    },
    [stations],
  );

  // Per-account listening history: recorded on the server for signed-in users
  // (`pushRecentPlay` is a no-op without a session, so guests stay local).
  useEffect(() => {
    if (current) {
      void dispatch(pushRecentPlay(current.id));
    }
  }, [current, dispatch]);

  // System media controls: lock-screen / OS notification / headset buttons.
  useEffect(() => {
    const media = navigator.mediaSession;
    if (!media) {
      return;
    }
    if (!current) {
      media.metadata = null;
      return;
    }
    try {
      media.metadata = new MediaMetadata({
        title: current.name,
        artist:
          [current.country, current.language].filter(Boolean).join(' · ') ||
          'RadioHub',
        album:
          current.bitrate > 0 ? `${current.bitrate} kbps` : 'Radio dal mondo',
        artwork:
          current.favicon.length > 0
            ? [{ src: current.favicon, sizes: '512x512', type: 'image/png' }]
            : [],
      });
      media.setActionHandler('play', () => dispatch(togglePlay()));
      media.setActionHandler('pause', () => dispatch(togglePlay()));
      media.setActionHandler('previoustrack', () => {
        const previous = findNeighbour(current, -1);
        if (previous) {
          dispatch(playStation(previous));
        }
      });
      media.setActionHandler('nexttrack', () => {
        const next = findNeighbour(current, 1);
        if (next) {
          dispatch(playStation(next));
        }
      });
    } catch {
      // Older browsers: media controls stay unavailable, playback unaffected.
    }
    return () => {
      try {
        media.setActionHandler('play', null);
        media.setActionHandler('pause', null);
        media.setActionHandler('previoustrack', null);
        media.setActionHandler('nexttrack', null);
      } catch {
        // Ignore cleanup failures on teardown.
      }
    };
  }, [current, dispatch, findNeighbour]);

  // Browser tab title mirrors the playback state.
  useEffect(() => {
    document.title =
      current && isPlaying ? `▶ ${current.name} – RadioHub` : 'RadioHub';
  }, [current, isPlaying]);

  // Global shortcuts: Space toggles, ←/→ change station, ↑/↓ volume, M mutes.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!current) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase() ?? '';
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (
        [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(
          event.key,
        )
      ) {
        event.preventDefault();
      }
      switch (event.key) {
        case ' ':
          dispatch(togglePlay());
          break;
        case 'ArrowLeft': {
          const previous = findNeighbour(current, -1);
          if (previous) {
            dispatch(playStation(previous));
          }
          break;
        }
        case 'ArrowRight': {
          const next = findNeighbour(current, 1);
          if (next) {
            dispatch(playStation(next));
          }
          break;
        }
        case 'ArrowUp':
          dispatch(setVolume(Math.min(1, volume + 0.05)));
          break;
        case 'ArrowDown':
          dispatch(setVolume(Math.max(0, volume - 0.05)));
          break;
        case 'm':
        case 'M':
          dispatch(setVolume(volume > 0 ? 0 : 0.8));
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [current, volume, dispatch, findNeighbour]);

  // Keep the browser tab in sync with playback.
  useEffect(() => {
    document.title =
      isPlaying && current ? `▶ ${current.name} - RadioHub` : 'RadioHub';
    return () => {
      document.title = 'RadioHub';
    };
  }, [isPlaying, current]);

  // Keyboard shortcuts: K toggles play/pause, M toggles mute.
  // Skipped inside form fields so typing is never hijacked.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'k' || event.key === 'K') {
        event.preventDefault();
        dispatch(togglePlay());
      } else if (event.key === 'm' || event.key === 'M') {
        dispatch(setVolume(volume > 0 ? 0 : 0.8));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, volume]);

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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition hover:bg-accent-soft"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Play className="h-5 w-5" aria-hidden="true" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-slate-100">
                {current.name}
              </p>
              <Equalizer
                playing={isPlaying}
                mini
                className={`h-3 ${isPlaying ? 'opacity-100' : 'opacity-40'}`}
              />
            </div>

            {/* Riga modificata: mt-[3px] per abbassare tutto e items-center per allineare gli elementi */}
            <div className="flex min-w-0 items-center gap-2 mt-[5px]">
              <p className="min-w-0 truncate text-xs text-slate-400">
                {[current.country, current.language]
                  .filter(Boolean)
                  .join(' · ') || '—'}
                {current.bitrate > 0 ? ` · ${current.bitrate} kbps` : ''}
              </p>
              <PlaybackStatusBadge
                status={playbackStatus}
                onRetry={handleRetry}
                compact
              />
            </div>
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-500/20 hover:text-slate-50"
          >
            <ChevronUp className="h-5 w-5" aria-hidden="true" />
          </button>

          <span
            onClick={(event) => event.stopPropagation()}
            className="flex shrink-0 items-center"
          >
            <SleepTimer compact />
          </span>

          <button
            type="button"
            onClick={(event) => {
              // Stop bubbling: the bar itself opens the full-screen overlay,
              // so without this the player would reopen while closing.
              event.stopPropagation();
              dismissPlayer();
            }}
            aria-label="Chiudi completamente il player"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-500/20 hover:text-slate-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {expanded ? <FullPlayer onClose={closeFullPlayer} /> : null}
    </>
  );
}
