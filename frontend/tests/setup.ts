import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

/**
 * Quel che jsdom non ha, stubbato **una volta sola** per tutti i test.
 */

/**
 * jsdom non implementa la riproduzione dei media: `Player` chiama `play()` e
 * `pause()` e senza questi stub ogni test fallirebbe con "Not implemented".
 * Sono `vi.fn()` perché i test ci verificano sopra.
 */
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  writable: true,
  value: vi.fn().mockResolvedValue(undefined),
});
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

/** jsdom non ha `IntersectionObserver` (lo usa la sezione Notizie). */
class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: number[] = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);

afterEach(() => {
  cleanup();
  // Preferiti e cronologia vivono in `localStorage`: ogni test parte da zero.
  window.localStorage.clear();
  document.title = 'RadioHub';
});
