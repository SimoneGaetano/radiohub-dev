/**
 * Placeholder that mirrors the layout of `RadioCard` while the search is
 * still in flight, so the grid keeps its shape instead of collapsing to an
 * empty state or a lone spinner.
 */
export function RadioSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3"
    >
      <div className="h-14 w-14 shrink-0 animate-pulse rounded-lg bg-slate-800" />

      <div className="min-w-0 flex-1 space-y-2 py-1">
        <div className="h-4 w-3/4 animate-pulse rounded bg-slate-800" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-800" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-800" />
      </div>

      <div className="flex shrink-0 items-start gap-1.5">
        <div className="h-9 w-9 animate-pulse rounded-full bg-slate-800" />
        <div className="h-9 w-9 animate-pulse rounded-full bg-slate-800" />
      </div>
    </div>
  );
}