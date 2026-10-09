import { Search, Sparkles, X } from 'lucide-react';
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import {
  TOP_STATIONS_LIMIT,
  clearInterpretation,
  interpretSearch,
  searchRadios,
  setGenreFilter,
  setSearchTerm,
} from '../features/radios/radiosSlice';
import { useDebounce } from '../hooks/useDebounce';
import { PILL_QUERIES, type GenrePillId } from './GenrePills';

/** Page size for a typed search; the clean baseline always fetches the top 50. */
const SEARCH_LIMIT = 20;

/** Etichette dei filtri interpretati (X3), in italiano. */
const ORDER_LABELS: Record<string, string> = {
  votes: 'Le più votate',
  clickcount: 'Le più ascoltate',
  name: 'Ordine alfabetico',
  bitrate: 'Qualità più alta',
};

export function SearchBar() {
  const dispatch = useAppDispatch();
  const searchTerm = useAppSelector((state) => state.radios.searchTerm);
  const genreFilter = useAppSelector((state) => state.radios.genreFilter);
  const interpretation = useAppSelector((state) => state.radios.interpretation);
  const interpreting = useAppSelector((state) => state.radios.interpreting);
  const interpretError = useAppSelector((state) => state.radios.interpretError);
  const debouncedTerm = useDebounce(searchTerm, 450);

  /**
   * THE single fetch orchestrator. Server params always derive from the current
   * Redux state, so switching pills can never leave residue behind.
   *
   * - Con un'interpretazione attiva (X3) i parametri sono **quelli**: l'utente ha
   *   chiesto di cercare per frase, e resta così finché non digita di nuovo o
   *   sceglie una pill.
   * - With text typed: free search (`q`), pills are reset to 'all' by the input.
   * - With a pill selected: the pill's **own server-side query** (tag chain,
   *   country, bitrate, ordering) over the whole catalogue.
   * - "Tutti"/mount: the clean top-50 baseline.
   */
  useEffect(() => {
    if (interpretation) {
      const { filters } = interpretation;

      void dispatch(
        searchRadios({
          q: filters.q ?? '',
          limit: TOP_STATIONS_LIMIT,
          page: 1,
          ...(filters.tags ? { tags: filters.tags } : {}),
          ...(filters.countryCode ? { countryCode: filters.countryCode } : {}),
          ...(filters.bitrateMin !== undefined
            ? { bitrateMin: filters.bitrateMin }
            : {}),
          ...(filters.order ? { order: filters.order } : {}),
        }),
      );
      return;
    }

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
  }, [dispatch, searchTerm, debouncedTerm, genreFilter, interpretation]);

  const canInterpret = searchTerm.trim().length >= 2;

  const handleInterpret = () => {
    if (!canInterpret || interpreting) {
      return;
    }
    void dispatch(interpretSearch(searchTerm.trim()));
  };

  const chips: string[] = [];
  if (interpretation) {
    const { filters } = interpretation;
    if (filters.q) {
      chips.push(`Nome: ${filters.q}`);
    }
    if (filters.tags && filters.tags.length > 0) {
      chips.push(`Genere: ${filters.tags[0]}`);
    }
    if (filters.countryCode) {
      chips.push(`Paese: ${filters.countryCode}`);
    }
    if (filters.bitrateMin !== undefined) {
      chips.push(`Alta qualità (≥${filters.bitrateMin} kbps)`);
    }
    if (filters.order && ORDER_LABELS[filters.order]) {
      chips.push(ORDER_LABELS[filters.order]);
    }
  }

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
            // Digitare annulla l'interpretazione (X3) e la pill: vince il testo.
            dispatch(clearInterpretation());
            dispatch(setSearchTerm(event.target.value));
            dispatch(setGenreFilter('all'));
          }}
          onKeyDown={(event) => {
            // Invio = "interpreta questa frase", non una ricerca per nome.
            if (event.key === 'Enter') {
              event.preventDefault();
              handleInterpret();
            }
          }}
          placeholder="jazz, rock, news… oppure «una radio jazz italiana»"
          className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-accent-border"
        />
      </label>

      {/* X3: la frase viene tradotta in filtri dal backend (modello o regole). */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleInterpret}
          disabled={!canInterpret || interpreting}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent-border bg-slate-900 px-3 py-1.5 text-xs font-medium text-accent-text transition hover:bg-slate-800 disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {interpreting ? 'Interpretazione…' : 'Interpreta la frase'}
        </button>

        {interpretation ? (
          <button
            type="button"
            onClick={() => dispatch(clearInterpretation())}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          >
            <X className="h-3 w-3" aria-hidden="true" />
            Cancella i filtri
          </button>
        ) : null}
      </div>

      {interpretation ? (
        <div className="space-y-1">
          <ul
            aria-label="Filtri interpretati"
            className="flex flex-wrap gap-1.5 text-xs"
          >
            {chips.map((chip) => (
              <li
                key={chip}
                className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-200"
              >
                {chip}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400">
            {interpretation.source === 'ai'
              ? `Capito dal modello (${interpretation.provider ?? 'AI'})`
              : 'Capito con le regole locali: nessun modello configurato'}
            {interpretation.note ? ` — ${interpretation.note}` : ''}
          </p>
        </div>
      ) : null}

      {interpretError ? (
        <p className="text-xs text-rose-300">{interpretError}</p>
      ) : null}
    </section>
  );
}
