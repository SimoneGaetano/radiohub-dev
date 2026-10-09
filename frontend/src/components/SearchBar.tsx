import { Search } from 'lucide-react';
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import {
  TOP_STATIONS_LIMIT,
  searchRadios,
  setGenreFilter,
  setSearchTerm,
} from '../features/radios/radiosSlice';
import { useDebounce } from '../hooks/useDebounce';
import { PILL_QUERIES, type GenrePillId } from './GenrePills';

/** Page size for a typed search; the clean baseline always fetches the top 50. */
const SEARCH_LIMIT = 20;

export function SearchBar() {
  const dispatch = useAppDispatch();
  const searchTerm = useAppSelector((state) => state.radios.searchTerm);
  const genreFilter = useAppSelector((state) => state.radios.genreFilter);
  const debouncedTerm = useDebounce(searchTerm, 450);

  /**
   * THE single fetch orchestrator. Server params always derive from the current
   * Redux state, so switching pills can never leave residue behind.
   *
   * - With text typed: free search (`q`), pills are reset to 'all' by the input.
   * - With a pill selected: the pill's **own server-side query** (tag chain,
   *   country, bitrate, ordering) over the whole catalogue.
   * - "Tutti"/mount: the clean top-50 baseline.
   *
   * While typing the debounced term is used; the empty state resets instantly
   * (no debounce lag after "Tutti").
   */
  useEffect(() => {
    const trimmed = searchTerm.trim();
    const effectiveQ = trimmed ? debouncedTerm.trim() : '';

    if (effectiveQ) {
      void dispatch(
        searchRadios({ q: effectiveQ, limit: SEARCH_LIMIT, page: 1 }),
      );
      return;
    }

    const pill = PILL_QUERIES[genreFilter as GenrePillId] ?? null;
    if (pill) {
      void dispatch(
        searchRadios({
          q: '',
          limit: TOP_STATIONS_LIMIT,
          page: 1,
          ...pill,
        }),
      );
      return;
    }

    void dispatch(searchRadios({ q: '', limit: TOP_STATIONS_LIMIT, page: 1 }));
  }, [dispatch, searchTerm, debouncedTerm, genreFilter]);

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Cerca una radio</h2>
      <label className="relative block">
        <span className="sr-only">Cerca una radio per nome</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => {
            // A typed search wins over pills: reset the pill to 'all'.
            dispatch(setSearchTerm(event.target.value));
            dispatch(setGenreFilter('all'));
          }}
          placeholder="jazz, rock, news…"
          className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-accent-border"
        />
      </label>
    </section>
  );
}