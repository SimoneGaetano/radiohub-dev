import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostStream } from '../src/hooks/usePostStream';
import type { PostEventPayload } from '../src/types';

/**
 * X5 — flusso SSE dei post.
 *
 * jsdom non implementa `EventSource`, quindi si sostituisce con una classe finta
 * che registra le istanze e permette di emettere eventi a mano: si verifica così
 * il comportamento del hook (apertura, chiusura, lettura del messaggio) senza
 * rete e senza timer.
 */
class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  closed = false;
  private readonly listeners = new Map<
    string,
    ((event: MessageEvent) => void)[]
  >();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: MessageEvent) => void,
  ): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  close(): void {
    this.closed = true;
  }

  /** Simula un evento in arrivo dal server. */
  emit(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(new MessageEvent(type, { data }));
    }
  }
}

/** Componente minimo: mostra quanti eventi ha ricevuto il hook. */
function Probe() {
  const [received, setReceived] = useState<PostEventPayload[]>([]);

  usePostStream((payload) => {
    setReceived((prev) => [...prev, payload]);
  });

  return (
    <p data-testid="received">
      {received.length}:{received[0]?.created ?? 0}
    </p>
  );
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePostStream (X5)', () => {
  it('apre il flusso e lo chiude allo smontaggio', () => {
    const { unmount } = render(<Probe />);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe('/api/posts/stream');

    unmount();

    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it('consegna al componente l’evento ricevuto', () => {
    render(<Probe />);
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit(
        'posts',
        JSON.stringify({
          created: 2,
          updated: 1,
          at: '2026-10-10T11:00:00.000Z',
        }),
      );
    });

    expect(screen.getByTestId('received')).toHaveTextContent('1:2');
  });

  it('ignora un evento non interpretabile senza chiudere il flusso', () => {
    render(<Probe />);
    const source = FakeEventSource.instances[0];

    act(() => {
      source.emit('posts', 'non-json');
    });

    expect(screen.getByTestId('received')).toHaveTextContent('0:0');
    expect(source.closed).toBe(false);
  });
});
