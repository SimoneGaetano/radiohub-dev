/**
 * Install prompt (PWA) captured at **startup**, before React mounts.
 *
 * `beforeinstallprompt` is fired by Chromium as soon as the installability
 * criteria are met — usually right after the first paint, often *before* the
 * React tree exists — and the event can be used **once**. Capturing it here
 * (imported by `main.tsx`) means the UI never misses it, and subscribers read
 * the current value whenever they mount.
 *
 * The event is never account-related: installing is a device/browser action.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(event: BeforeInstallPromptEvent | null) => void>();

function notify(): void {
  for (const listener of listeners) {
    listener(deferredPrompt);
  }
}

/** Registers the listeners once, as early as possible. */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keeps Chromium's own mini-infobar away so our UI is the only entry point.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  // Installed from the browser UI (or another tab) meanwhile: nothing to offer.
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

/**
 * Subscribes to the deferred prompt. The listener is called immediately with the
 * current value, so a component mounting later still gets it.
 */
export function subscribeInstallPrompt(
  listener: (event: BeforeInstallPromptEvent | null) => void,
): () => void {
  listeners.add(listener);
  listener(deferredPrompt);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Discards the deferred prompt: after `prompt()` the event is spent and
 * Chromium will not fire a new one until the next page load.
 */
export function clearInstallPrompt(): void {
  deferredPrompt = null;
  notify();
}

/** `true` when the app already runs as an installed PWA (standalone mode). */
export function isStandalone(): boolean {
  const navigatorStandalone = (
    window.navigator as { standalone?: boolean }
  ).standalone;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorStandalone === true
  );
}
