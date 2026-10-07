import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppDispatch } from '../app/hooks';
import { searchRadios } from '../features/radios/radiosSlice';
import { useDebounce } from '../hooks/useDebounce';

export function SearchBar() {
  const dispatch = useAppDispatch();
  const [term, setTerm] = useState('');
  const debouncedTerm = useDebounce(term, 450);

  useEffect(() => {
    void dispatch(
      searchRadios({ q: debouncedTerm.trim(), limit: 20, page: 1 }),
    );
  }, [dispatch, debouncedTerm]);

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
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="jazz, rock, news…"
          className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-500"
        />
      </label>
    </section>
  );
}