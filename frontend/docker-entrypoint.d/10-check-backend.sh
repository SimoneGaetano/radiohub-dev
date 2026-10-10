#!/bin/sh
# X2 — controllo delle variabili del proxy, eseguito **prima** di nginx.
#
# Perché esiste: `envsubst` sostituisce senza validare. Se `BACKEND_HOST` contiene
# uno schema, una barra o una porta, nginx muore con
# `[emerg] invalid port in upstream "://onrender.com:443"`, che non dice quale
# campo correggere. Qui si fallisce subito, indicando il campo e la forma attesa.
#
# L'entrypoint di `nginx:alpine` esegue i file di `/docker-entrypoint.d/` in ordine
# alfabetico: `10-` (questo) prima di `20-envsubst-on-templates.sh`.

problems=""

case "${BACKEND_SCHEME:-http}" in
  http | https) ;;
  *)
    problems="${problems}
  BACKEND_SCHEME deve essere 'http' o 'https' (valore attuale: '${BACKEND_SCHEME}')"
    ;;
esac

# Solo nome host: nessuno schema (`://`), nessuna barra, nessuna porta (`:`).
case "${BACKEND_HOST:-}" in
  '')
    problems="${problems}
  BACKEND_HOST è vuoto: serve il nome host del backend (es. radiohub-backend-abc1.onrender.com)"
    ;;
  *://* | */* | *:*)
    problems="${problems}
  BACKEND_HOST deve contenere solo il nome host, senza schema, barre o porta (valore attuale: '${BACKEND_HOST}')"
    ;;
esac

case "${BACKEND_PORT:-}" in
  '' | *[!0-9]*)
    problems="${problems}
  BACKEND_PORT deve essere un numero, senza lettere (valore attuale: '${BACKEND_PORT}')"
    ;;
esac

if [ -n "$problems" ]; then
  echo "❌ Configurazione del proxy verso il backend non valida:$problems

Esempio corretto:
  BACKEND_SCHEME=https
  BACKEND_HOST=radiohub-backend-abc1.onrender.com
  BACKEND_PORT=443

In locale (docker compose) i valori sono già:
  BACKEND_SCHEME=http
  BACKEND_HOST=backend
  BACKEND_PORT=4000" >&2
  exit 1
fi

echo "Proxy verso il backend: ${BACKEND_SCHEME}://${BACKEND_HOST}:${BACKEND_PORT}"
