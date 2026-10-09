/* eslint-disable react-refresh/only-export-components --
   Il modulo esporta le costanti `PILL_QUERIES` (e i tipi) accanto al componente
   perché sono la stessa informazione: `SearchBar` le legge per costruire la
   query della pill attiva. Spostarle in un altro file per zittire un warning di
   fast-refresh peggiorerebbe la coesione. */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import {
  resetRadiosFilters,
  setGenreFilter,
  setSearchTerm,
} from '../features/radios/radiosSlice';

/**
 * Genre pill id → station predicate. Anything the RadioBrowser-shaped API
 * cannot express server-side (tags, country, bitrate) is filtered locally.
 */
export type GenrePillId =
  | 'all'
  | 'top-italia'
  | 'pop'
  | 'rock'
  | 'dance'
  | 'decades'
  | 'jazz'
  | 'classical'
  | 'chillout'
  | 'news'
  | 'hd';

interface Pill {
  id: GenrePillId;
  label: string;
}

const PILLS: Pill[] = [
  { id: 'all', label: 'Tutti' },
  { id: 'top-italia', label: 'Top Italia' },
  { id: 'pop', label: 'Pop' },
  { id: 'rock', label: 'Rock' },
  { id: 'dance', label: 'Dance/EDM' },
  { id: 'decades', label: '80s & 90s' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'classical', label: 'Classica' },
  { id: 'chillout', label: 'Chillout' },
  { id: 'news', label: 'News' },
  { id: 'hd', label: 'HD > 128kbps' },
];

/**
 * Genre pill id → the **server-side** query it runs. The pills are no longer a
 * local filter over the current 50 results (which made several of them empty):
 * each one asks the backend for the matching stations of the whole catalogue.
 * Tags are user-submitted upstream and inconsistent, so each pill lists
 * candidates tried in order until one returns results.
 */
export interface PillQuery {
  tags?: string[];
  countryCode?: string;
  bitrateMin?: number;
  order?: 'votes';
}

export const PILL_QUERIES: Record<GenrePillId, PillQuery | null> = {
  all: null,
  'top-italia': { countryCode: 'IT', order: 'votes' },
  pop: { tags: ['pop'], order: 'votes' },
  rock: { tags: ['rock', 'alternative', 'indie', 'metal'], order: 'votes' },
  dance: {
    tags: ['dance', 'edm', 'electro', 'house', 'techno'],
    order: 'votes',
  },
  decades: { tags: ['80s', '90s', 'oldies', 'retro'], order: 'votes' },
  jazz: { tags: ['jazz', 'blues', 'soul', 'funk'], order: 'votes' },
  classical: { tags: ['classical', 'opera', 'symphony'], order: 'votes' },
  chillout: {
    tags: ['chillout', 'lounge', 'ambient', 'relax'],
    order: 'votes',
  },
  news: { tags: ['news', 'talk', 'information', 'sport'], order: 'votes' },
  hd: { bitrateMin: 128, order: 'votes' },
};

/**
 * Quick genre/quality pills above the grid. Every pill is **server-backed**:
 * it asks the backend for the matching slice of the whole catalogue (tag,
 * country, bitrate), so a genre is never limited to what happens to be in the
 * current list. Favourites are not a pill: they live in the dedicated section.
 */
export function GenrePills() {
  const dispatch = useAppDispatch();
  const active = useAppSelector((state) => state.radios.genreFilter);
  const items = useAppSelector((state) => state.radios.items);
  const status = useAppSelector((state) => state.radios.status);
  const pending = status === 'loading';
  /**
   * Pills whose query returned nothing are hidden (except the active one), so
   * the row never offers a view that is guaranteed to be empty.
   */
  const [emptyPills, setEmptyPills] = useState<string[]>([]);

  useEffect(() => {
    if (status === 'succeeded' && items.length === 0 && active !== 'all') {
      setEmptyPills((pills) =>
        pills.includes(active) ? pills : [...pills, active],
      );
    }
  }, [status, items.length, active]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Arrow visibility, recomputed on scroll, resize and mount. */
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncArrows = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    setCanScrollLeft(element.scrollLeft > 4);
    setCanScrollRight(
      element.scrollWidth - element.clientWidth - element.scrollLeft > 4,
    );
  }, []);

  useEffect(() => {
    syncArrows();
    window.addEventListener('resize', syncArrows);
    return () => window.removeEventListener('resize', syncArrows);
  }, [syncArrows]);

  /**
   * Mouse wheel scrolls the strip horizontally — the usual behaviour for a row
   * of chips — but only while it can actually move: at either edge the page
   * keeps scrolling normally. Registered natively because React attaches wheel
   * listeners as passive, where `preventDefault()` has no effect.
   */
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (element.scrollWidth <= element.clientWidth) {
        return;
      }
      const delta =
        Math.abs(event.deltaY) > Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      const atStart = element.scrollLeft <= 0 && delta < 0;
      const atEnd =
        element.scrollLeft + element.clientWidth >= element.scrollWidth - 1 &&
        delta > 0;
      if (atStart || atEnd) {
        return;
      }
      event.preventDefault();
      element.scrollLeft += delta;
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  /** Moves the strip by roughly one "page" of pills. */
  const scrollByPage = (direction: -1 | 1) => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    element.scrollBy({
      left: direction * Math.max(element.clientWidth * 0.8, 200),
      behavior: 'smooth',
    });
  };

  const handleSelect = (pill: Pill) => {
    if (pill.id === active) {
      return;
    }
    if (pill.id === 'all') {
      // Full baseline reset: clears search text + filters so SearchBar
      // refires the exact same clean top-50 call as the initial mount.
      dispatch(resetRadiosFilters());
      return;
    }
    if (pill.id === 'top-italia') {
      // Server-backed: clear the typed search first so no q residue remains,
      // then SearchBar fetches fresh Italian results via the genre branch.
      dispatch(setSearchTerm(''));
      dispatch(setGenreFilter(pill.id));
      return;
    }
    // Local-only pill: the fetch orchestrator reuses the current dataset
    // (already the full base unless a search term is active).
    dispatch(setGenreFilter(pill.id));
  };

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        onScroll={syncArrows}
        className="no-scrollbar -mx-1 flex touch-pan-x gap-2 overflow-x-auto scroll-smooth px-1 py-1"
        role="group"
        aria-label="Filtra per genere"
      >
        {PILLS.filter(
          (pill) => !emptyPills.includes(pill.id) || pill.id === active,
        ).map((pill) => {
          const isActive = pill.id === active;
          const isBusy = pill.id === 'top-italia' && pending;
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => handleSelect(pill)}
              disabled={isBusy}
              aria-pressed={isActive}
              className={
                isActive
                  ? 'shrink-0 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent shadow transition hover:bg-accent-soft'
                  : 'shrink-0 rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-50 disabled:opacity-60'
              }
            >
              {isBusy ? 'Caricamento…' : pill.label}
            </button>
          );
        })}
      </div>

      {/* Mouse-friendly scrolling: the strip has no visible scrollbar, so the
          arrows appear only when there is something to scroll. */}
      {canScrollLeft ? (
        <button
          type="button"
          onClick={() => scrollByPage(-1)}
          aria-label="Scorri i filtri a sinistra"
          className="absolute left-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-950/90 text-slate-300 shadow transition hover:border-accent-border hover:text-accent-text"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}

      {canScrollRight ? (
        <button
          type="button"
          onClick={() => scrollByPage(1)}
          aria-label="Scorri i filtri a destra"
          className="absolute right-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-950/90 text-slate-300 shadow transition hover:border-accent-border hover:text-accent-text"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
