import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { clearAuthError, login, register } from '../features/auth/authSlice';

type Mode = 'login' | 'register';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AuthModal({ open, onClose }: Props) {
  const dispatch = useAppDispatch();
  const { status, error, user } = useAppSelector((state) => state.auth);

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (user) {
      onClose();
    }
  }, [user, onClose]);

  useEffect(() => {
    if (open) {
      dispatch(clearAuthError());
    }
  }, [open, dispatch]);

  if (!open) {
    return null;
  }

  const busy = status === 'loading';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const credentials = { email: email.trim(), password };
    if (mode === 'login') {
      void dispatch(login(credentials));
    } else {
      void dispatch(register(credentials));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Autenticazione"
    >
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">
            {mode === 'login' ? 'Accedi' : 'Crea un account'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded p-1 text-slate-400 transition hover:text-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="space-y-1">
            <label
              htmlFor="auth-email"
              className="text-xs font-medium text-slate-400"
            >
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-accent-border"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="auth-password"
              className="text-xs font-medium text-slate-400"
            >
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={8}
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-accent-border"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {mode === 'login' ? 'Accedi' : 'Registrati'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="mt-4 w-full text-center text-xs text-slate-400 underline-offset-2 transition hover:text-slate-200 hover:underline"
        >
          {mode === 'login'
            ? 'Non hai un account? Registrati'
            : 'Hai già un account? Accedi'}
        </button>
      </div>
    </div>
  );
}