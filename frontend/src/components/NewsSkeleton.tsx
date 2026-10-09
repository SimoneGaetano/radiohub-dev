/**
 * Placeholder mirroring the news card layout while the list is in flight, so
 * the section keeps its shape instead of collapsing to a lone spinner —
 * consistent with `RadioSkeleton` in the grid.
 */
export function NewsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/60 p-4"
    >
      <div className="h-4 w-4/5 animate-pulse rounded bg-slate-800" />
      <div className="h-3 w-1/3 animate-pulse rounded bg-slate-800" />
      <div className="mt-1 h-3 w-full animate-pulse rounded bg-slate-800" />
      <div className="h-3 w-11/12 animate-pulse rounded bg-slate-800" />
      <div className="mt-1 h-7 w-32 animate-pulse rounded-lg bg-slate-800" />
    </div>
  );
}
