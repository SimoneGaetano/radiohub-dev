import {
  AlertTriangle,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Newspaper,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import {
  fetchPosts,
  showMore,
  summarizePost,
} from '../features/posts/postsSlice';
import { useDebounce } from '../hooks/useDebounce';
import type { Post } from '../types';
import { useToast } from './Toast';
import { NewsSkeleton } from './NewsSkeleton';

/** Number of placeholder cards shown while the first read is in flight. */
const SKELETON_COUNT = 4;
/** Typing pause before the server-side title filter (F3) is queried. */
const FILTER_DEBOUNCE_MS = 350;
/** Re-read cadence, aligned with the backend news sync (B2). */
const REFRESH_MS = 5 * 60 * 1000;
/** Distance from the bottom at which the next page is revealed. */
const SCROLL_ROOT_MARGIN = '240px';

/**
 * Strips the mock provider prefix and any residual leading dash/whitespace so
 * the summary always starts with readable text.
 */
function cleanSummary(summary: string): string {
  return summary
    .replace(/\[MOCK SUMMARY\]\s*/gi, '')
    .replace(/^[\s\-–—:]+/, '')
    .trim();
}

/**
 * News section (F3): the posts coming from `GET /api/posts`, a **title filter**
 * and **incremental loading** of a list that can be long.
 *
 * Two deliberate choices, both documented in the README:
 *
 * - the filter is **server-side** (`?title=…`, the parameter built in B2), so it
 *   searches the whole table and not only the articles already downloaded;
 * - paging is a **client-side window** over the rows already in the store: the
 *   plain listing is exactly what Redis caches (B3), so "show more" widens the
 *   window instead of re-downloading the same articles at every step. The button
 *   is both the fallback for browsers without `IntersectionObserver` and the
 *   accessible, keyboard-reachable way to reveal the next page.
 */
export function NewsSection() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { items, status, error, summarizingId, titleFilter, visible } =
    useAppSelector((state) => state.posts);

  /** Local text of the input: the store only ever sees the debounced value. */
  const [titleInput, setTitleInput] = useState('');
  const debouncedTitle = useDebounce(titleInput, FILTER_DEBOUNCE_MS);
  /**
   * Summaries are collapsed by default: an article shows its summary only when
   * the reader asks for it ("Mostra riassunto"). Nothing is persisted, so every
   * visit starts compact.
   */
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  /** Time of the last successful read, shown next to the count. */
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  /** Marker observed to reveal the next page while scrolling (F3). */
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const appliedTitle = debouncedTitle.trim();

  /**
   * THE single fetch orchestrator (same shape as `SearchBar`): every request
   * derives from the current input, so the filter and the periodic refresh can
   * never race each other into an inconsistent list. No filter → no `title`
   * parameter, which is exactly what makes the request eligible for the Redis
   * cache of B3.
   */
  useEffect(() => {
    void dispatch(fetchPosts(appliedTitle ? { title: appliedTitle } : undefined));
  }, [dispatch, appliedTitle]);

  useEffect(() => {
    if (status === 'succeeded') {
      setLastUpdated(
        new Date().toLocaleTimeString('it-IT', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    }
  }, [status, items.length]);

  /**
   * No manual refresh button: the list re-reads itself on the same cadence as
   * the backend sync (5 minutes) and the header shows when it last happened.
   * The filter travels with the request, so a background read never wipes what
   * the reader is currently looking at.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      void dispatch(
        fetchPosts(appliedTitle ? { title: appliedTitle } : undefined),
      );
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [dispatch, appliedTitle]);

  const visibleItems = items.slice(0, visible);
  const hasMore = visibleItems.length < items.length;

  /**
   * Infinite scroll (F3): the sentinel sits right below the grid, so the next
   * page is revealed before the reader reaches the end. `hasMore` closes the
   * loop, and a fresh observer is attached on every change of `visible`.
   */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          dispatch(showMore());
        }
      },
      { rootMargin: SCROLL_ROOT_MARGIN },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [dispatch, hasMore, visible]);

  /**
   * One button, three states: generate (first time, then it opens), show or
   * hide. A summary that already exists costs no model call.
   */
  const handleSummary = async (post: Post) => {
    if (post.summary) {
      setExpandedIds((ids) =>
        ids.includes(post.id)
          ? ids.filter((id) => id !== post.id)
          : [...ids, post.id],
      );
      return;
    }

    const result = await dispatch(summarizePost(post.id))
      .unwrap()
      .catch(() => null);

    if (result) {
      setExpandedIds((ids) => [...ids, post.id]);
    } else {
      showToast('Riassunto non disponibile, riprova', 'error');
    }
  };

  /**
   * Shared section title: every state (loading, error, empty, list) renders it
   * inside the `#notizie` anchor, so the header link always scrolls somewhere.
   */
  const sectionHeading = (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <Newspaper className="h-5 w-5 text-accent-text" aria-hidden="true" />
      Notizie
    </h2>
  );

  /**
   * How many articles are shown out of how many match the current filter. Read
   * aloud by assistive tech when it changes — i.e. exactly when the window grows.
   * With no rows there is nothing to count: say whether we are still waiting or
   * the filter simply matched nothing.
   */
  const statusLine =
    items.length > 0
      ? `${visibleItems.length} di ${items.length} notizie${
          lastUpdated ? ` · aggiornato alle ${lastUpdated}` : ''
        }`
      : status === 'loading'
        ? 'Caricamento…'
        : 'Nessuna notizia';

  let body: ReactNode;

  if (status === 'loading' && items.length === 0) {
    body = (
      <div
        role="status"
        aria-label="Caricamento delle notizie"
        className="grid gap-3 sm:grid-cols-2"
      >
        <span className="sr-only">Caricamento delle notizie…</span>
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <NewsSkeleton key={index} />
        ))}
      </div>
    );
  } else if (status === 'failed' && items.length === 0) {
    body = (
      <div className="flex items-start gap-3 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="block font-semibold">Errore</strong>
          {error}
        </span>
      </div>
    );
  } else if (items.length === 0) {
    /**
     * An empty result with a filter in force is a different message from an
     * empty feed — and the way out (clearing it) is offered right there.
     */
    body = titleFilter ? (
      <div className="rounded-lg border border-dashed border-slate-800 py-10 text-center text-sm text-slate-400">
        <p>Nessuna notizia con “{titleFilter}” nel titolo.</p>
        <button
          type="button"
          onClick={() => setTitleInput('')}
          className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-accent-border hover:text-accent-text"
        >
          Azzera il filtro
        </button>
      </div>
    ) : (
      <p className="rounded-lg border border-dashed border-slate-800 py-10 text-center text-sm text-slate-400">
        Nessuna notizia disponibile al momento.
      </p>
    );
  } else {
    body = (
      <div className="grid gap-3 sm:grid-cols-2">
        {visibleItems.map((post) => {
          const isSummarizing = summarizingId === post.id;
          const summaryText = post.summary ? cleanSummary(post.summary) : '';
          const isExpanded = expandedIds.includes(post.id);

          return (
            <article
              key={post.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  {post.title}
                </h3>
                <p className="text-xs text-slate-400">
                  {new Date(post.publishedAt).toLocaleDateString('it-IT', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>

              <p className="line-clamp-3 text-sm text-slate-400">
                {post.content}
              </p>

              {summaryText && isExpanded ? (
                <div className="rounded-lg border border-accent-border bg-emerald-950/30 p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-accent-text">
                    Riassunto AI
                  </p>
                  <p className="text-sm text-emerald-100">{summaryText}</p>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void handleSummary(post)}
                disabled={isSummarizing}
                aria-expanded={summaryText ? isExpanded : undefined}
                className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-accent-border hover:text-accent-text disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSummarizing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : summaryText ? (
                  isExpanded ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {summaryText
                  ? isExpanded
                    ? 'Nascondi riassunto'
                    : 'Mostra riassunto'
                  : 'Riassumi con AI'}
              </button>
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <section id="notizie" className="scroll-mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {sectionHeading}

        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-xs text-slate-400"
        >
          {status === 'loading' && items.length > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          {statusLine}
        </p>
      </div>

      {/* F3 — filter by title; the server applies it after the typing pause. */}
      <label className="relative block">
        <span className="sr-only">Filtra le notizie per titolo</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={titleInput}
          onChange={(event) => setTitleInput(event.target.value)}
          placeholder="Filtra per titolo…"
          className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2.5 pl-9 pr-10 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-accent-border"
        />
        {titleInput ? (
          <button
            type="button"
            onClick={() => setTitleInput('')}
            aria-label="Azzera il filtro"
            title="Azzera il filtro"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </label>

      {body}

      {hasMore ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => dispatch(showMore())}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 transition hover:border-accent-border hover:text-accent-text"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
            Mostra altre notizie
          </button>
        </div>
      ) : null}

      {/* Marker watched by the infinite scroll: its only job is to be reached. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
    </section>
  );
}