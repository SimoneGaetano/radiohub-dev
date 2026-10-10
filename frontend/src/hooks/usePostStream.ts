import { useEffect, useRef } from 'react';
import { API_BASE_URL } from '../services/api';
import type { PostEventPayload } from '../types';

/** Nome dell'evento SSE pubblicato dal backend quando arrivano post nuovi. */
const POST_EVENT = 'posts';

/**
 * X5 — si collega al flusso di eventi dei post e chiama `onEvent` a ogni evento.
 *
 * Perché `EventSource` e non un WebSocket: il flusso è a senso unico, non serve
 * una libreria e la **riconnessione è automatica** — il browser riprova da solo
 * rispettando il `retry` annunciato dal server, quindi non c'è codice di retry da
 * mantenere (né da sbagliare).
 *
 * Il flusso è pubblico come `GET /api/posts`: gli articoli si leggono anche da
 * ospiti e `EventSource` non sa inviare header di autenticazione.
 */
export function usePostStream(
  onEvent: (payload: PostEventPayload) => void,
): void {
  // Il callback cambia a ogni render (chiude su stato e dispatch): tenerlo in un
  // ref evita di chiudere e riaprire la connessione a ogni render.
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    // Ambienti senza EventSource (test, browser molto vecchi): niente flusso.
    if (typeof EventSource === 'undefined') {
      return;
    }

    const source = new EventSource(`${API_BASE_URL}/posts/stream`);

    source.addEventListener(POST_EVENT, (event) => {
      try {
        handlerRef.current(
          JSON.parse((event as MessageEvent).data) as PostEventPayload,
        );
      } catch {
        // Evento non interpretabile: si ignora, il flusso resta aperto.
      }
    });

    return () => {
      source.close();
    };
  }, []);
}
