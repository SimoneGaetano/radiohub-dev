/* eslint-disable react-refresh/only-export-components --
   Il modulo esporta la funzione `formatRemaining` accanto al componente: è la
   stessa logica di formattazione del conto alla rovescia, e separarla in un
   altro file la renderebbe raggiungibile da fuori senza motivo. */
import { Timer, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { clearSleepTimer, setSleepTimer } from '../features/player/playerSlice';
import { useToast } from './Toast';

/** Preset countdowns in minutes, plus a custom entry below. */
const PRESETS = [15, 30, 45, 60] as const;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Formats a millisecond delta as h:mm:ss (or m:ss under one hour). */
export function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

/**
 * Sleep timer dropdown: pick a countdown (15/30/45/60 min or custom),
 * see the remaining time live, and cancel it. The actual stop is fired by
 * the expiry watcher in `Player.tsx` so it works from every surface.
 */
export function SleepTimer({ compact = false }: { compact?: boolean }) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const sleepEndsAt = useAppSelector((state) => state.player.sleepEndsAt);
  const [open, setOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement | null>(null);

  const active = sleepEndsAt !== null;

  // Tick the countdown once per second while the timer runs.
  useEffect(() => {
    if (!active) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  // Close the menu on outside click / Escape.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointer);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', handlePointer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const schedule = (minutes: number) => {
    dispatch(setSleepTimer(minutes));
    setOpen(false);
    setCustomMinutes('');
    showToast(`Spegnimento automatico tra ${minutes} minuti`, 'info');
  };

  const cancel = () => {
    dispatch(clearSleepTimer());
    setOpen(false);
    showToast('Timer di spegnimento disattivato', 'info');
  };

  const handleCustom = () => {
    const minutes = Number(customMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 720) {
      showToast('Inserisci un numero di minuti valido (1-720)', 'error');
      return;
    }
    schedule(Math.round(minutes));
  };
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-label={
          active && sleepEndsAt !== null
            ? `Timer attivo, spegnimento tra ${formatRemaining(sleepEndsAt - now)}`
            : 'Imposta il timer di spegnimento'
        }
        aria-expanded={open}
        title="Timer di spegnimento"
        className={
          compact
            ? `flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-slate-500/20 hover:text-slate-50 ${active ? 'text-accent-text' : 'text-slate-400'}`
            : `flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-slate-500/20 hover:text-slate-50 ${active ? 'text-accent-text' : 'text-slate-300'}`
        }
      >
        <Timer className="h-5 w-5" aria-hidden="true" />
      </button>

      {active && sleepEndsAt !== null ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent/20 px-1.5 text-[10px] font-semibold tabular-nums text-accent-text"
        >
          {formatRemaining(sleepEndsAt - now)}
        </span>
      ) : null}

      {open ? (
        <div
          role="menu"
          aria-label="Timer di spegnimento"
          onClick={(event) => event.stopPropagation()}
          className="absolute bottom-full z-50 mb-2 w-52 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl"
        >
          <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Spegni tra…
          </p>
          {PRESETS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              role="menuitem"
              onClick={() => schedule(minutes)}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-200 transition hover:bg-slate-500/20"
            >
              {minutes} minuti
            </button>
          ))}
          <div className="mt-1 flex items-center gap-1.5 border-t border-slate-800 px-2 pt-2">
            <input
              type="number"
              min={1}
              max={720}
              value={customMinutes}
              onChange={(event) => setCustomMinutes(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleCustom();
                }
              }}
              placeholder="Min…"
              aria-label="Minuti personalizzati"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100 outline-none placeholder:text-slate-400 focus:border-accent-border"
            />
            <button
              type="button"
              onClick={handleCustom}
              className="shrink-0 rounded-md bg-accent px-2 py-1 text-sm font-semibold text-on-accent transition hover:bg-accent-soft"
            >
              OK
            </button>
          </div>
          {active ? (
            <button
              type="button"
              role="menuitem"
              onClick={cancel}
              className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-red-300 transition hover:bg-slate-500/20"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Disattiva timer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
