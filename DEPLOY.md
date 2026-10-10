# Deploy pubblico (X2)

Questa guida spiega **come RadioHub sta su un URL pubblico e come rifare il
deploy**: <https://radiohub-frontend.onrender.com> (Render: frontend, backend,
PostgreSQL, Redis). È scritta per essere seguita da zero, ma è anche il **resoconto
di un deploy vero**: i cinque punti della sezione 4 non sono ipotesi, sono gli errori
incontrati davvero e come si riconoscono dal log.

> **Stato**: X2 è **svolto e verificato** — gli esiti delle chiamate sull'URL sono
> nella sezione finale. Le due modifiche nel codice che servivano davvero — proxy di
> nginx a *template* e `TRUST_PROXY` — sono dentro l'immagine, quindi locale e cloud
> usano lo **stesso artefatto**: cambiano solo le variabili d'ambiente.

## Cosa serve

- Un account su [Render](https://render.com) — piano free, senza carta.
- 10 minuti.
- Facoltativo: una chiave `GEMINI_API_KEY`. Senza, l'app **funziona** ma risponde
  con le regole locali e i riassunti offline (comportamento dichiarato nel README).

## Perché Render

| Piattaforma | Pro | Contro |
| --- | --- | --- |
| **Render** | supporta Docker, blueprint dichiarativo, Postgres e Redis gestiti, piano free senza carta | il Postgres free viene **cancellato dopo 30 giorni** |
| Railway / Fly.io | molto semplici | richiedono credito o carta anche per il piano free |
| VPS (Hetzner, Oracle) | tutto in `docker compose`, identico alla locale | carta richiesta e TLS da gestire a mano |

**Il deploy è del 10/10/2026 e il database free scade il 9/11/2026** (30 giorni):
per una valutazione dentro quella finestra basta così. Per un URL che duri di più:
sostituisci il database con [Neon](https://neon.tech) e la cache con
[Upstash](https://upstash.com) — free senza scadenza — e incolla le due stringhe di
connessione in `DATABASE_URL` e `REDIS_URL`. **Non serve toccare il codice.**

## I passi

### 1. Blueprint (via più rapida)

1. Render → *New* → **Blueprint** → collega il repository `radiohub-dev`.
2. Render legge `render.yaml` e propone quattro risorse: `radiohub-backend`,
   `radiohub-frontend`, `radiohub-redis`, `radiohub-db`.
3. **Apply**. Il primo build dura 5-8 minuti (due immagini Docker, più database e
   cache).
4. Quando `radiohub-backend` è *Live*: *Environment* → incolla `GEMINI_API_KEY`, se
   ce l'hai. Il redeploy parte da solo.

### 2. Strada manuale (se il blueprint dà errore)

> **Osservato in un deploy reale (10/10/2026)**: la blueprint ha creato *database*,
> *cache* e *backend*, ma **non** il frontend, che è l'unica risorsa con un
> riferimento a un'altra (`BACKEND_HOST` da `fromService`). Il backend, creato con
> la stessa forma ma senza riferimenti, è andato a buon fine: è quello il punto.
> Il `render.yaml` ora scrive `BACKEND_HOST` come valore esplicito (`radiohub-backend`),
> quindi un nuovo sync non dovrebbe più inciampare.
>
> Nota per chi legge i log: `failed to read dockerfile: open Dockerfile: no such
> file or directory` significa che il *Dockerfile Path* è stato messo a
> `./Dockerfile` **senza** una Root Directory: Render lo cerca nella radice del
> repo, dove non c'è. Il percorso corretto è `frontend/Dockerfile` (relativo alla
> radice), esattamente come il backend usa `backend/Dockerfile`.

`render.yaml` è stato usato nel deploy reale: la blueprint ha creato database, cache
e backend, ma **non** il frontend (l'unica risorsa con un `fromService`). Se anche a
te la blueprint lascia fuori una risorsa, creala a mano con questi passi — la
dashboard dice comunque quale campo non le piace:

1. **PostgreSQL** → *New* → *Postgres* → piano free, nome `radiohub-db`.
2. **Redis** → *New* → *Key Value* → piano free, nome `radiohub-redis`.
3. **Backend** → *New* → *Web Service* → *Build from a Dockerfile*, context
   `backend/`, health check `/api/health`, poi le variabili:
   `NODE_ENV=production`, `PORT=4000`, `TRUST_PROXY=2`,
   `DATABASE_URL` (dashboard del database → *Internal Connection String*),
   `REDIS_URL` (idem, dal Key Value),
   `JWT_SECRET` e `SYNC_API_KEY` (valori lunghi e casuali),
   `SUMMARY_PROVIDER=auto`.
4. **Frontend** → *New* → *Web Service* → Docker, context `frontend/`, health check
   `/`, variabili: `BACKEND_HOST` = host **interno** del backend (dashboard del
   backend → *Connect* → *Internal*, senza porta) e `BACKEND_PORT=4000`.

   **Campi della dashboard, uno per uno** (monorepo: la *Root Directory* è ciò che
   rende il contesto `frontend/`):
   - *Name*: `radiohub-frontend`
   - *Region*: **la stessa del backend** (senza, la rete interna non li collega)
   - *Branch*: `main`
   - *Root Directory*: `frontend`
   - *Runtime*: **Docker** (Dockerfile path `./Dockerfile`)
   - *Instance Type*: Free
   - *Health Check Path*: `/`
   - *Environment*: `BACKEND_HOST` = host interno del backend (senza porta),
     `BACKEND_PORT` = `4000`

   Sono le due variabili che riempiono il template di nginx: è la modifica che
   rende la stessa immagine utilizzabile in locale e su un cloud.

   `BACKEND_HOST` accetta **sia il nome host sia l'URL completo**
   (`https://radiohub-backend.onrender.com`): il container li normalizza all'avvio.
5. Attendi gli healthcheck: quando entrambi sono *Live*, apri l'URL del frontend.

### 3. Verifica sull'URL pubblico

Cinque comandi, nessuna interpretazione: se rispondono, il deploy funziona. Gli
esiti ottenuti su questo deploy sono nella sezione finale.

```bash
BASE=https://radiohub-frontend.onrender.com   # il tuo URL

curl -s $BASE/api/health                        # {"status":"ok", ...}
curl -s "$BASE/api/radios?limit=3" | head -c 300    # il catalogo risponde
curl -s $BASE/api/posts | head -c 200               # le notizie sono in tabella
curl -s -N --max-time 8 $BASE/api/posts/stream      # SSE: "event: ready" subito
curl -s $BASE/api/openapi.json | head -c 200        # la specifica è servita
```

E dalla UI: cerca una radio, avvia l'ascolto, accedi, salva un preferito, ricarica
la pagina e verifica che il preferito ci sia ancora.

> L'audio va **dal browser direttamente alla stazione**: se non senti nulla è la
> stazione, non il deploy. Tutto il resto passa solo dall'URL pubblico.

### 4. Le cinque cose che rompono un deploy

0. **Il frontend esce all'avvio con `[emerg] host not found in upstream
   "radiohub-backend"`** → nginx non risolve il nome **interno** del backend: la
   rete privata fra servizi non è disponibile per tutti i piani (e i nomi interni
   possono differire da quelli attesi). Il frontend non deve passare per la rete
   interna: usa l'**URL pubblico** del backend, che funziona sempre —
   `BACKEND_SCHEME=https`, `BACKEND_HOST=<backend>.onrender.com` (senza `https://`),
   `BACKEND_PORT=443`. È anche il motivo per cui lo *scheme* è configurabile: in
   locale il proxy resta su `http://backend:4000`, senza cambiare l'immagine.

   Se invece il messaggio è `invalid port in upstream "://onrender.com:443"` o
   `host not found`: `envsubst` sostituisce **senza validare**, quindi un valore
   scritto male diventa una direttiva nginx rotta. Per questo il container, prima
   di avviare nginx, passa da `docker-entrypoint.d/10-backend-config.envsh`, che
   **normalizza** `BACKEND_SCHEME`/`BACKEND_HOST`/`BACKEND_PORT` e in caso di
   problema esce con un messaggio che dice cosa fare:

   - sono accettate **entrambe** le forme: `radiohub-backend.onrender.com` (nome
     host) **e** `https://radiohub-backend.onrender.com` (URL completo — l'errore
     più comune, e il motivo per cui la normalizzazione esiste);
   - una porta attaccata all'host (`host:443`) viene separata da sola;
   - se il valore è irrecuperabile (es. `://onrender.com`, privo del nome host) il
     container lo dice **prima** di nginx e non parte, invece di produrre un errore
     di nginx che non indica il campo sbagliato.
1. **Il frontend risponde ma `/api/*` dà `502`** → `BACKEND_HOST`/`BACKEND_PORT`
   (o `BACKEND_SCHEME`) sbagliati: il template di nginx punta a un host che non
   esiste o al protocollo sbagliato.
2. **Il backend non parte, o riavvia in loop** → `DATABASE_URL`/`REDIS_URL`
   mancanti, o presi dalla stringa *esterna* invece che da quella *interna*.
3. **Il rate limiting blocca tutti insieme** → `TRUST_PROXY` sbagliato: con l'edge
   della piattaforma **e** nginx del frontend davanti al backend servono **2** hop.
   Si vede dalle chiavi in Redis (`ratelimit:api:*`): comparirebbe l'IP del proxy,
   uguale per tutti.
4. **Il flusso SSE non arriva** → `proxy_buffering off` è già nel template; se hai
   cambiato tu il proxy, il punto è lì.
5. **Errori CORS** → non dovrebbero esistere: il browser parla solo con il frontend
   (stessa origine). Se li vedi, stai chiamando il backend direttamente.

### 5. Dopo il deploy

- ✓ **README aggiornato** con l'URL e con la **scadenza** del database free
  (9/11/2026, cioè 30 giorni dal deploy del 10/10/2026), più il riferimento a questa
  guida per rifare il deploy.
- ✓ **Il database si è riempito da solo**: il backend applica migrazioni e seed
  all'avvio e sincronizza il feed (11 notizie al primo avvio).

## Cosa è stato verificato

| Verifica | Esito |
| --- | --- |
| Il proxy di nginx è un **template**: dentro il container c'è `proxy_pass http://backend:4000`, generato da `BACKEND_HOST`/`BACKEND_PORT` | ✓ letto in `/etc/nginx/conf.d/default.conf` |
| Il blocco SSE sopravvive al template (destinazione sostituita, `proxy_buffering off` intatto) | ✓ `event: ready` immediato con `curl -N` |
| Il percorso utente completo sulla configurazione nuova | ✓ E2E *cerca → ascolta → preferiti* verde (5,0 s) |
| Il file compose resta valido con le nuove variabili | ✓ `docker compose config -q` |
| `TRUST_PROXY` letto dall'ambiente, con default sicuro (1) | ✓ validato da `env.ts`; il caso `X-Forwarded-For` è già coperto dai test del rate limiting |
| `docker compose up` locale invariato | ✓ stack healthy, `/api/health` e `/api/posts` 200 via nginx |
| **Il deploy vero, sull'URL pubblico** | ✓ `https://radiohub-frontend.onrender.com`: `{"status":"ok"}`, 11 notizie dal feed, catalogo radio reale, **SSE attraverso l'edge HTTPS** (`event: ready` in pochi secondi), 20 path / 24 operation, X3 (`source=ai`, `tags=jazz`, `IT`) e X4 (3 fonti, 2 citate, risposta reale) |
| Un container locale che proxa verso il backend su Render | ✓ `BACKEND_HOST` con l'URL completo → normalizzato → `/api/health` 200 dal cloud |

Resta non verificabile da qui: la **tenuta nel tempo** dell'URL. Piano free: i
servizi vanno in pausa dopo 15 minuti di inattività e il database scade il
**9/11/2026**.
