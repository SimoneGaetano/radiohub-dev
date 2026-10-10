import { HelpCircle, Loader2, Quote } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { askNews } from '../features/posts/postsSlice';

/**
 * X4 — "Chiedi alle notizie": una domanda in linguaggio naturale sul corpus,
 * con la risposta e **le fonti** che l'hanno prodotta.
 *
 * Qui si mostra sempre anche il passaggio usato, non solo la sintesi: quando il
 * modello non è configurato l'API risponde con i soli passaggi
 * (`source: 'retrieval'`) e l'interfaccia lo dice, invece di far sembrare rotta
 * una funzione che sta lavorando come previsto. Le fonti **citate** dal modello
 * sono evidenziate; le altre restano visibili come contesto.
 */
export function NewsAskPanel() {
  const dispatch = useAppDispatch();
  const { ask, asking, askError } = useAppSelector((state) => state.posts);
  const [question, setQuestion] = useState('');

  const canAsk = question.trim().length >= 3;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canAsk || asking) {
      return;
    }
    void dispatch(askNews(question.trim()));
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <HelpCircle className="h-4 w-4 text-accent-text" aria-hidden="true" />
        Chiedi alle notizie
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        Risponde usando <strong>solo gli articoli pubblicati</strong> e mostra i
        passaggi da cui ha preso la risposta.
      </p>

      <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Domanda sulle notizie</span>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="es. cosa si dice del festival del rock?"
            className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-accent-border"
          />
        </label>
        <button
          type="submit"
          disabled={!canAsk || asking}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent-border px-3 py-2 text-xs font-medium text-accent-text transition hover:bg-slate-800 disabled:opacity-50"
        >
          {asking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : null}
          {asking ? 'Cerco…' : 'Chiedi'}
        </button>
      </form>

      {askError ? (
        <p className="mt-2 text-xs text-rose-300" role="alert">
          {askError}
        </p>
      ) : null}

      {ask ? (
        <div className="mt-3 space-y-3">
          {ask.answer ? (
            <p className="text-sm text-slate-100">{ask.answer}</p>
          ) : (
            <p className="text-sm text-slate-300">
              {ask.sources.length > 0
                ? 'Nessuna sintesi dal modello: ecco i passaggi più pertinenti.'
                : 'Nelle notizie pubblicate non c’è nulla che risponda a questa domanda.'}
            </p>
          )}

          {ask.sources.length > 0 ? (
            <ul aria-label="Fonti usate" className="space-y-2">
              {ask.sources.map((source) => (
                <li
                  key={source.postId}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 p-3"
                >
                  <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-200">
                    <Quote
                      className="h-3 w-3 text-accent-text"
                      aria-hidden="true"
                    />
                    {source.title}
                    {ask.citationIds.includes(source.postId) ? (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-on-accent">
                        citata
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    “{source.excerpt}”
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
