import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value`, updated after `delayMs` of inactivity.
 */
export function useDebounce<T>(value: T, delayMs = 450): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}