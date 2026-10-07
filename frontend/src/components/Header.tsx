import { LogOut, Radio, User } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { logout } from '../features/auth/authSlice';

interface Props {
  onOpenAuth: () => void;
}

export function Header({ onOpenAuth }: Props) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);

  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex items-center gap-2">
          <Radio className="h-6 w-6 text-emerald-400" aria-hidden="true" />
          <span className="text-xl font-bold tracking-tight">RadioHub</span>
        </div>

        {user ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-300 sm:inline">
              {user.email}
            </span>
            <button
              type="button"
              onClick={() => void dispatch(logout())}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Esci
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenAuth}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
          >
            <User className="h-4 w-4" aria-hidden="true" />
            Accedi / Registrati
          </button>
        )}
      </div>
    </header>
  );
}