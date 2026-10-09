import { Download, Heart, LogOut, Newspaper, Radio, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { logout } from '../features/auth/authSlice';
import {
  adoptGuestLibrary,
  fetchServerRecents,
  GUEST_OWNER,
  switchLibraryOwner,
  syncFavorites,
} from '../features/player/playerSlice';
import {
  clearInstallPrompt,
  isStandalone,
  subscribeInstallPrompt,
  type BeforeInstallPromptEvent,
} from '../utils/installPrompt';
import { ThemeToggle } from './ThemeToggle';
import { useToast } from './Toast';

interface Props {
  onOpenAuth: () => void;
}

export function Header({ onOpenAuth }: Props) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const user = useAppSelector((state) => state.auth.user);
  /** Identity menu (avatar) open state. */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  /**
   * PWA install prompt: captured at startup (`utils/installPrompt.ts`), so it is
   * never missed. It is a **device** state, not an account one: it does not
   * change when the user signs in or out.
   */
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  /** Already running as an installed app → nothing to offer. */
  const [standalone] = useState(() => isStandalone());
  const canInstall = installEvent !== null && !standalone;

  // Library per identity: signing in opens the account's own slot (adopting the
  // guest data the first time), signing out goes back to the guest slot. The
  // account data is never deleted here — it lives on the server.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      dispatch(switchLibraryOwner(GUEST_OWNER));
      return;
    }

    dispatch(switchLibraryOwner(userId));

    void (async () => {
      const adopted = await dispatch(adoptGuestLibrary())
        .unwrap()
        .catch(() => false);
      const synced = await dispatch(syncFavorites())
        .unwrap()
        .catch(() => null);

      if (synced) {
        showToast(
          adopted
            ? `Libreria locale unita all’account (${synced.ids.length} preferiti)`
            : `Preferiti dell’account caricati (${synced.ids.length})`,
          'info',
        );
      }
      void dispatch(fetchServerRecents());
    })();
  }, [userId, dispatch, showToast]);

  // PWA install prompt: no listener to register here, the capture happens at
  // startup and the current value is delivered immediately on subscribe.
  useEffect(() => subscribeInstallPrompt(setInstallEvent), []);

  const handleInstall = () => {
    if (!installEvent) {
      return;
    }
    void installEvent
      .prompt()
      .then(() => installEvent.userChoice)
      .then((choice) => {
        // The event is single-use: discard it whether accepted or dismissed
        // (Chromium fires a fresh one on the next page load).
        clearInstallPrompt();
        setMenuOpen(false);
        if (choice.outcome === 'accepted') {
          showToast('RadioHub installata: la trovi tra le app', 'success');
        }
      })
      .catch(() => clearInstallPrompt());
  };

  // Close the identity menu on an outside click or with Esc.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  /** Display name / avatar letter: we only have the e-mail for now. */
  const userName = user?.email.split('@')[0] ?? '';
  const userInitial = user?.email.charAt(0).toUpperCase() ?? '';
  const menuItemClass =
    'mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-200 transition hover:bg-slate-500/10 hover:text-slate-50';

  const handleLogout = () => {
    setMenuOpen(false);
    // Logging out only ends the session: the device keeps its library
    // (the favourites label switches back to "questo dispositivo").
    void dispatch(logout());
    showToast('Uscita effettuata', 'info');
  };

  return (
    <header className="relative z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
        <div className="flex items-center gap-2">
          <Radio className="h-6 w-6 text-accent-text" aria-hidden="true" />
          <span className="text-xl font-bold tracking-tight">RadioHub</span>
        </div>

        <div className="flex items-center gap-2">
          {/* "Preferiti" navigation tab: scrolls to the favourites section. */}
          <button
            type="button"
            onClick={() =>
              document
                .getElementById('preferiti')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            aria-label="Vai ai preferiti"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-rose-500 hover:text-rose-300"
          >
            <Heart className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Preferiti</span>
          </button>

          {/* "Notizie" navigation tab: scrolls to the news section. */}
          <button
            type="button"
            onClick={() =>
              document
                .getElementById('notizie')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-accent-border hover:text-accent-text"
          >
            <Newspaper className="h-4 w-4" aria-hidden="true" />
            Notizie
          </button>

          {/* Tema chiaro/scuro (X7): sta fra le sezioni e il profilo, quindi lo
              vedono anche gli ospiti. */}
          <ThemeToggle />

          {/* Account: a compact avatar opens the identity menu, so the e-mail no
              longer sits in the middle of the navigation tabs. */}
          {user ? (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Menu utente di ${user.email}`}
                title={user.email}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent transition hover:bg-accent-soft"
              >
                {userInitial}
              </button>

              {menuOpen ? (
                <div
                  role="menu"
                  aria-label="Menu utente"
                  className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl"
                >
                  <div className="border-b border-slate-800 px-3 pb-2">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {userName}
                    </p>
                    <p
                      className="truncate text-xs text-slate-400"
                      title={user.email}
                    >
                      {user.email}
                    </p>
                  </div>

                  {canInstall ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        handleInstall();
                      }}
                      className={menuItemClass}
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Installa app
                    </button>
                  ) : null}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className={menuItemClass}
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Esci
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {/* Guests have no identity menu, but installing is not an account
                  action: the icon stands on its own while installable. */}
              {canInstall ? (
                <button
                  type="button"
                  onClick={handleInstall}
                  aria-label="Installa RadioHub come app"
                  title="Installa app"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition hover:border-accent-border hover:text-accent-text"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}

              <button
                type="button"
                onClick={onOpenAuth}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent transition hover:bg-accent-soft"
              >
                <User className="h-4 w-4" aria-hidden="true" />
                Accedi / Registrati
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}