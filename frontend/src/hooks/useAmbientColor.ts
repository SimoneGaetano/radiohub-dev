import { FastAverageColor } from 'fast-average-color';
import { useEffect, useState } from 'react';

/** A single canvas is reused for every station switch. */
const averageColor = new FastAverageColor();

/** API base used by the frontend (nginx/Vite proxy `/api` to the backend). */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

/**
 * Reading canvas pixels requires the image to be CORS-enabled, and many radio
 * hosts do not send the header: those stations used to fall back to the neutral
 * gradient. Fetching the artwork through our own `/api/media` proxy makes the
 * request **same-origin**, so the dominant colour is always available.
 * The visible cover is still loaded directly (unchanged behaviour).
 */
function proxiedImageUrl(url: string): string {
  return `${API_BASE}/media?url=${encodeURIComponent(url)}`;
}

/**
 * Maps any artwork colour into a mid tone: dark logos are lifted and bright
 * ones are pulled back, so the tint is always visible without ever blowing
 * out the dark gradient of the overlay.
 */
function toTint(value: number[]): string {
  const [red = 0, green = 0, blue = 0] = value;
  const max = Math.max(red, green, blue, 1);
  const scale = max < 90 ? 90 / max : max > 200 ? 200 / max : 1;
  const channel = (v: number) => Math.round(v * scale);
  return `rgb(${channel(red)} ${channel(green)} ${channel(blue)})`;
}

interface TintState {
  /** The url the stored colour belongs to. */
  url: string;
  /** `null` while loading, or whenever the read fails (no art, CORS). */
  color: string | null;
}

/**
 * Returns the dominant colour of the artwork at `url`, or `null`.
 *
 * The value is compared against `url` on every render, so the moment a new
 * station is selected the hook answers `null` — the overlay falls back to its
 * neutral dark gradient instead of keeping the previous station's colour
 * while the extraction runs. Missing artwork or a host without CORS headers
 * also resolve to `null`, never to a hard-coded accent.
 *
 * The visible cover is deliberately fetched without `crossOrigin`, otherwise
 * images from hosts without CORS headers would stop loading entirely.
 */
export function useAmbientColor(url: string): string | null {
  const [state, setState] = useState<TintState>({ url: '', color: null });

  useEffect(() => {
    let cancelled = false;

    if (!url) {
      return;
    }

    averageColor
      .getColorAsync(proxiedImageUrl(url), {
        algorithm: 'dominant',
        crossOrigin: 'anonymous',
        silent: true,
      })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setState({ url, color: result.error ? null : toTint(result.value) });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ url, color: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  // Mismatch on the very first render after a station switch: no stale tint.
  return state.url === url ? state.color : null;
}
