# Deploy pubblico (X2)

Questa guida porta RadioHub su un **URL pubblico**. La parte nel codice è fatta e
provata in locale; **la parte manuale è tua**, perché creare l'account richiede la
tua email (su qualche piattaforma serve anche una carta, pure per il piano free).

> **Stato onesto**: finché non esiste un URL verificato, X2 non è svolto. Questa
> guida esiste perché il resto non sia improvvisato: le due modifiche che servivano
> davvero — proxy di nginx configurabile e `TRUST_PROXY` — sono già dentro e sono
> state provate ricostruendo lo stack.

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

**Se il deploy è il 10/10 e la valutazione è entro il 9/11, il database free di
Render basta.** Per un URL che duri di più: sostituisci il database con
[Neon](https://neon.tech) e la cache con [Upstash](https://upstash.com) — free
senza scadenza — e incolla le due stringhe di connessione in `DATABASE_URL` e
`REDIS_URL`. **Non serve toccare il codice.**

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
> *cache* e *backend*, ma **non** il frontend. Il sospetto è la risoluzione di
> `fromService` (`BACKEND_HOST` ricavato dal servizio backend) al momento della
> creazione: sono due risorse dello stesso blueprint, e la seconda dipende dalla
> prima. Non vale la pena combattere con la blueprint: si crea il frontend a mano
> con i passi qui sotto, che sono **gli stessi** che avrebbe eseguito lei.

`render.yaml` non è stato provato contro Render (non ho un account): se un campo
non piace alla piattaforma, la dashboard dice quale. Gli stessi passi a mano:

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
5. Attendi gli healthcheck: quando entrambi sono *Live*, apri l'URL del frontend.

### 3. Verifica sull'URL pubblico

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

1. **Il frontend risponde ma `/api/*` dà `502`** → `BACKEND_HOST`/`BACKEND_PORT`
   sbagliati: il template di nginx punta a un host che non esiste. Copia l'host
   **interno** dalla dashboard.
2. **Il backend non parte, o riavvia in loop** → `DATABASE_URL`/`REDIS_URL`
   mancanti, o presi dalla stringa *esterna* invece che da quella *interna*.
3. **Il rate limiting blocca tutti insieme** → `TRUST_PROXY` sbagliato: con l'edge
   della piattaforma davanti servono **2** hop. Si vede dalle chiavi in Redis
   (`ratelimit:api:*`): comparirebbe l'IP del proxy, uguale per tutti.
4. **Il flusso SSE non arriva** → `proxy_buffering off` è già nel template; se hai
   cambiato tu il proxy, il punto è lì.
5. **Errori CORS** → non dovrebbero esistere: il browser parla solo con il frontend
   (stessa origine). Se li vedi, stai chiamando il backend direttamente.

### 5. Dopo il deploy

- Aggiorna il README con **l'URL** e con la **data di scadenza** del database free
  (Render: 30 giorni), più il comando per rifare il deploy.
- Il backend applica migrazioni e seed all'avvio e sincronizza il feed: il primo
  deploy riempie il database da solo.

## Cosa è stato provato senza account

| Verifica | Esito |
| --- | --- |
| Il proxy di nginx è un **template**: dentro il container c'è `proxy_pass http://backend:4000`, generato da `BACKEND_HOST`/`BACKEND_PORT` | ✓ letto in `/etc/nginx/conf.d/default.conf` |
| Il blocco SSE sopravvive al template (destinazione sostituita, `proxy_buffering off` intatto) | ✓ `event: ready` immediato con `curl -N` |
| Il percorso utente completo sulla configurazione nuova | ✓ E2E *cerca → ascolta → preferiti* verde (5,0 s) |
| Il file compose resta valido con le nuove variabili | ✓ `docker compose config -q` |
| `TRUST_PROXY` letto dall'ambiente, con default sicuro (1) | ✓ validato da `env.ts`; il caso `X-Forwarded-For` è già coperto dai test del rate limiting |
| `docker compose up` locale invariato | ✓ stack healthy, `/api/health` e `/api/posts` 200 via nginx |

Quello che **non** posso verificare senza account: il deploy vero, l'edge HTTPS
della piattaforma e la tenuta dell'URL nel tempo.
