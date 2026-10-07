import { AlertTriangle, Loader2, Newspaper, Sparkles } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { summarizePost } from '../features/posts/postsSlice';

export function NewsSection() {
  const dispatch = useAppDispatch();
  const { items, status, error, summarizingId } = useAppSelector(
    (state) => state.posts,
  );

  if (status === 'loading' && items.length === 0) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Caricamento delle notizie…
      </div>
    );
  }

  if (status === 'failed' && items.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-900 bg-red-950/40 p-4 text-sm text-red-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="block font-semibold">Errore</strong>
          {error}
        </span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 py-10 text-center text-sm text-slate-400">
        Nessuna notizia disponibile al momento.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Newspaper className="h-5 w-5 text-emerald-400" aria-hidden="true" />
        Notizie
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((post) => {
          const isSummarizing = summarizingId === post.id;

          return (
            <article
              key={post.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  {post.title}
                </h3>
                <p className="text-xs text-slate-500">
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

              {post.summary ? (
                <div className="rounded-lg border border-emerald-900 bg-emerald-950/30 p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
                    Riassunto AI
                  </p>
                  <p className="text-sm text-emerald-100">{post.summary}</p>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void dispatch(summarizePost(post.id))}
                disabled={isSummarizing}
                className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-600 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSummarizing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {post.summary ? 'Rigenera riassunto' : 'Riassumi con AI'}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}