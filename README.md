# RadioHub

Monorepo del progetto **RadioHub**.

## Requisiti svolti

Copertura della traccia **22HBG**, con il rimando alla prova nel repository.
Legenda: `[x]` fatto · `[~]` parziale · `[ ]` non svolto.

### Obbligatori — 18/18

| Gruppo | Requisiti | Dove sta la prova |
| --- | --- | --- |
| **Backend** (B1–B5) | proxy radio con token lato server, job sul feed, cache Redis, auth JWT, OpenAPI | `backend/src/services/{radioSource,newsSyncService,authService}.ts`, `backend/src/docs/openapi.ts`, `backend/tests/` |
| **Frontend** (F1–F5) | ricerca con debounce, player HLS persistente, notizie con filtro e scroll infinito, preferiti, WCAG 2.1 AA | `frontend/src/components/`, `frontend/tests/` |
| **Integrazione AI** (A1–A3) | riassunti salvati al primo giro, provider astratto, timeout e difese sui testi | `backend/src/services/{summaryService,aiService}.ts` |
| **DevOps** (D1–D5) | `docker compose up`, configurazione solo da env, ESLint + Prettier, test, log strutturati e health | `docker-compose.yml`, `backend/src/config/env.ts`, `.github/workflows/ci.yml` |

Il dettaglio per singolo requisito, con il file e i test che lo coprono, sta in
[`TASKS.md`](./TASKS.md).

### Requisiti bonus svolti

| # | Bonus | Stato | Dove sta la prova |
| --- | --- | --- | --- |
| **X1** | Pipeline CI con lint, test e build | `[x]` | `.github/workflows/ci.yml`: `lint`, `format:check`, typecheck, test backend (97) e frontend (13), build — con Postgres e Redis reali come servizi |
| **X7** | PWA installabile, tema chiaro/scuro, condivisione radio | `[x]` | `frontend/public/manifest.json`, `frontend/public/sw.js`, `frontend/src/utils/{theme,installPrompt}.ts`, copia del link in `RadioCard` |
| **X6** | Rate limiting, helmet, CORS, refresh token | `[x]` | `backend/src/middleware/rateLimit.ts` (contatori Redis, 3 quote, `429` + header `RateLimit-*`), `POST /api/auth/refresh` e `/api/auth/logout` (`authService.ts`), rinnovo trasparente in `frontend/src/services/api.ts`; 13 test (`tests/rateLimit.test.ts`, `tests/refreshToken.test.ts`) |
| **X3** | Ricerca in linguaggio naturale | `[x]` | `POST /api/radios/search` (`backend/src/services/naturalSearchService.ts` + `modelClient.ts`): modello con risposta JSON validata da Zod e fallback a regole deterministiche (paesi + catene di tag delle pill); quota dedicata `nl-search`; 19 test backend e 4 frontend; README § *Ricerca in linguaggio naturale (X3)* |
| **X5** | Aggiornamento in tempo reale (SSE) | `[x]` | `GET /api/posts/stream` + bus su **Redis pub/sub** (`backend/src/realtime/postEvents.ts`), `location` dedicata con `proxy_buffering off` in `frontend/nginx.conf.template`, hook `usePostStream` agganciato a `NewsSection`; 3 test backend e 3 frontend; README § *Notizie in tempo reale (X5)* |
| **X4** | Domande sulle notizie (RAG) con fonti | `[x]` | `POST /api/posts/ask` (`backend/src/services/newsRagService.ts`): retrieval **TF-IDF** deterministico + sintesi del modello con citazioni **filtrate** sulle fonti recuperate; pannello `NewsAskPanel.tsx`; 16 test backend e 4 frontend; README § *Domande sulle notizie (X4)* |
| **X8** | E2E con Playwright (cerca → ascolta → preferiti) | `[x]` | `frontend/e2e/cerca-ascolta-preferiti.spec.ts`: flusso completo sulla **stack reale** (`docker compose`) con catalogo e audio controllati — `npm run test:e2e`, ~5 s, stabile su due esecuzioni di fila; workflow separato `.github/workflows/e2e.yml`; README § *Test end-to-end (X8)* |
| **X2** | Deploy su un cloud con URL pubblico | `[~]` | configurazione pronta e **provata in locale**: proxy nginx a *template* (`frontend/nginx.conf.template` + `BACKEND_HOST`/`BACKEND_PORT`), `TRUST_PROXY` configurabile, `render.yaml` e [`DEPLOY.md`](./DEPLOY.md) con passi e verifiche. **Manca l'URL pubblico**: creare l'account è un passo umano (~10 minuti, serve la tua email) |

**Perché questi sette.** X1 perché la CI è la prova che i test passano su una
macchina diversa dalla mia, e non solo sulla mia; X7 perché rende l'app usabile
da telefono come un'app vera — installazione, tema, condivisione — e tocca
accessibilità e UX, non solo funzionalità; X6 perché è l'unico che cambia la
**postura** dell'app, non le sue funzioni: quote per non farsi abusare e sessioni
brevi ma rinnovabili, con il logout che finalmente ha un effetto sul server; X3
perché cambia il **modo** di cercare: dalla parola esatta all'intenzione; X5
perché toglie il ritardo: le notizie arrivano quando il backend le trova; X4
perché aggiunge il "chiedi invece di scorrere", con le fonti a garanzia; X8 perché
verifica il percorso della traccia **come lo vede un utente**, non come lo vedono
i test unitari.

**X2 (deploy) è pronto ma non svolto**: la configurazione è fatta e provata in
locale, e la guida passo-passo è in [`DEPLOY.md`](./DEPLOY.md) — ma il bonus non è
svolto finché non esiste un **URL pubblico verificato**, e quell'ultimo passo
richiede un account (quindi è umano, non di codice). Quando l'URL esiste lo
verifico e aggiorno questa riga: preferisco un `[~]` onesto a un link rotto.

## Struttura

```
RadioHub/
├── backend/             # API Node.js + TypeScript (strict)
│   ├── prisma/
│   │   └── schema.prisma      # Schema Prisma (User, Favorite, Post)
│   ├── src/
│   │   ├── config/      # Validazione e tipizzazione delle env
│   │   ├── db/          # PrismaClient (singleton) + pool PostgreSQL (pg)
│   │   ├── generated/   # Prisma Client generato (git-ignored)
│   │   ├── middleware/  # Middleware Express (authenticateJWT)
│   │   ├── redis/       # Client Redis (ioredis)
│   │   ├── routes/      # Rotte HTTP (health, radios, auth, favorites, posts, sync)
│   │   ├── services/    # Logica di dominio (radio, auth, summary, newsSync, postsCache)
│   │   ├── app.ts       # Configurazione Express
│   │   └── index.ts     # Bootstrap + graceful shutdown
│   ├── .env.example     # Variabili d'ambiente di esempio
│   ├── prisma7.config.ts # Configurazione Prisma CLI (datasource URL)
│   ├── package.json
│   └── tsconfig.json    # TypeScript strict
├── frontend/            # Client React 19 + Vite + TypeScript + Tailwind v4
│   ├── src/
│   │   ├── app/         # Store Redux Toolkit + hook tipizzati
│   │   ├── components/  # Header, SearchBar, RadioGrid, RadioCard, Player, AuthModal, NewsSection
│   │   ├── features/    # Slice Redux (auth, radios, posts, player)
│   │   ├── hooks/       # useDebounce
│   │   ├── services/    # Client axios + gestione errori
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts   # Vite + plugin React + Tailwind + proxy /api
│   └── tsconfig.json    # TypeScript strict
├── docker-compose.yml   # PostgreSQL + Redis per lo sviluppo locale
├── TASKS.md             # Tracker: stato per requisito e task aperte
├── TASKS-archive.md     # Log dettagliato delle task (diagnosi, misure, verifiche)
└── .clinerules          # Regole del progetto
```

## Requisiti

- Node.js >= 20
- npm >= 10
- Docker + Docker Compose

## Stack completa con Docker (un solo comando)

```bash
docker compose up --build
```

| Servizio | URL / Porta            | Descrizione                                      |
| -------- | ---------------------- | ------------------------------------------------ |
| Frontend | http://localhost:8080  | Client React servito da nginx (con proxy `/api`) |
| Backend  | http://localhost:4000  | API Express                                      |
| Postgres | `localhost:5433`       | Database (porta host mappata su 5432)            |
| Redis    | `localhost:6379`       | Cache delle ricerche radio                       |

Al primo avvio il container `backend` esegue da solo `prisma migrate deploy`
prima di avviare l'API, quindi lo schema del database viene creato senza
intervento manuale. Ogni servizio ha un **healthcheck** e le dipendenze sono
dichiarate con `service_healthy`: il frontend parte solo quando il backend è
davvero pronto, e postgres/redis solo quando sono sani.

Per popolare l'app di contenuti di esempio:

```bash
docker compose exec backend npm run prisma:seed
```

Comandi utili:

```bash
docker compose ps            # stato e healthcheck dei servizi
docker compose logs -f backend
docker compose down          # ferma lo stack (i dati restano)
docker compose down -v       # ferma lo stack e azzera i dati
```

## Avvio rapido — Backend (sviluppo locale)

1. Avvia l'infrastruttura locale (Postgres + Redis):

   ```bash
   docker compose up -d
   ```

2. Configura e prepara il backend:

   ```bash
   cd backend
   cp .env.example .env
   npm install
   npx prisma generate
   ```

3. Avvia il server in modalità sviluppo:

   ```bash
   npm run dev
   ```

4. Verifica lo stato:

   - `GET http://localhost:4000/api/health` — liveness
   - `GET http://localhost:4000/api/health/ready` — readiness (Postgres + Redis)
   - `GET http://localhost:4000/api/radios?q=jazz&limit=20&page=1` — ricerca radio (proxy + cache Redis)
   - `GET http://localhost:4000/api/radios?tag=jazz,blues&order=votes&limit=50` — filtri delle pill (tag con fallback, `countryCode`, `bitrateMin`, `order`)
   - `GET http://localhost:4000/api/radios/by-ids?ids=a,b` — stazioni per id (preferiti/recenti creati altrove)
   - `GET http://localhost:4000/api/media?url=<encoded>` — proxy same-origin dell'artwork (colore ambientale del player)
   - `POST http://localhost:4000/api/ai/radio-info` — bio AI della stazione (bonus)
   - `POST http://localhost:4000/api/auth/register` — registrazione (`{ email, password }`)
   - `POST http://localhost:4000/api/auth/login` — login → `{ token, user }`
   - `GET|POST|DELETE http://localhost:4000/api/favorites` — preferiti (richiede `Authorization: Bearer <token>`)
   - `GET|POST|DELETE http://localhost:4000/api/recents` — cronologia ascolti per account (richiede il token)
   - `GET http://localhost:4000/api/posts` — notizie dal DB (lista completa, cache Redis)
   - `GET http://localhost:4000/api/posts?title=radio&items=5` — filtro per titolo e limite
   - `POST http://localhost:4000/api/sync` — sincronizzazione manuale del feed (`X-Sync-Key`)
   - `GET http://localhost:4000/api/posts/:id/summary` — riassunto AI del post (A1)
   - `POST http://localhost:4000/api/posts/:id/summary` — stessa operazione, usata dalla SPA

## Script backend

| Script             | Descrizione                                |
| ------------------ | ------------------------------------------ |
| `npm run dev`      | Avvia il server in watch mode (tsx)        |
| `npm run build`    | Compila TypeScript in `dist/`              |
| `npm start`        | Esegue il build compilato                  |
| `npm run typecheck`| Controllo dei tipi senza generare output   |
| `npm run clean`    | Rimuove `dist/`                            |
| `npm run prisma:generate` | Genera il Prisma Client             |
| `npm run prisma:migrate`  | Crea/applica una migrazione (dev)   |
| `npm run prisma:studio`   | Apre Prisma Studio                  |
| `npm run prisma:seed`     | Popola il DB con i post di esempio  |
| `npm test`                | Test di integrazione (Vitest + Supertest) |
| `npm run lint`            | ESLint 10 (flat config) con le regole del backend |
| `npm run lint:fix`        | ESLint con correzione automatica          |
| `npm run format`          | Prettier sulla cartella `backend/`        |
| `npm run format:check`    | Verifica la formattazione (exit 1 se cambia) |

## Avvio rapido — Frontend

```bash
cd frontend
npm install
npm run dev
```

L'app è disponibile su `http://localhost:5173`. In sviluppo le chiamate a `/api`
vengono proxied dal dev-server Vite verso il backend su `http://localhost:4000`
(quindi nessun problema di CORS).

### Funzionalità

- **Ricerca radio** con debounce (450 ms) e griglia di card, con stati
  `loading` / `empty` / `error` e badge `X-Cache: HIT|MISS`.
- **Player persistente** fissato in basso: play/pausa, volume, stazione corrente
  e streaming **HLS** (`.m3u8`) tramite `hls.js`. Nel full-screen lo sfondo si
  tinge con il **colore dominante della copertina**: l'immagine viene letta
  tramite il proxy same-origin `GET /api/media`, quindi l'estrazione funziona
  anche per gli host che non inviano header CORS.
- **Indicatore di stato del flusso (F2)**: badge `LIVE` / `Connessione…` /
  `Errore di riproduzione` con pulsante "Riprova", guidato dagli eventi reali
  dell'elemento audio. Un `AbortError` benigno (caricamento superato) non viene
  più segnalato come guasto e ogni flusso ha **un retry automatico** prima di
  essere dichiarato irraggiungibile.
- **Preferiti (F4)**: sezione dedicata `#preferiti` con la lista **completa** delle
  stazioni salvate — è letta dagli oggetti persistiti (`favoriteStations`), quindi
  non dipende dai risultati della ricerca in corso; play e rimozione dal cuore,
  contatore, stato vuoto ed etichetta *account* / *dispositivo*. Il cuore è su ogni
  card, e per gli utenti loggati preferiti e cronologia sono sincronizzati col
  backend (sezione "Dati per utente").
- **Ascoltate di recente**: striscia orizzontale con le ultime 10 stazioni
  riprodotte (nascosta quando vuota), con pulsante "Svuota".
- **Info AI (bonus)**: il pulsante ⓘ su ogni card e nel player genera con Gemini
  una bio in italiano di 2-3 frasi sulla stazione; se il provider non è
  disponibile si usa un testo di fallback, quindi la funzione non fallisce mai.
- **Filtri di genere (server-side)**: ogni pill interroga il backend con i filtri
  nativi della fonte — `tagList` con **catena di fallback** sui tag sinonimi
  (`chillout` → `lounge` → `ambient`), `countrycode` per "Top Italia",
  `bitrateMin` per "HD > 128" e `order=votes` per l'ordinamento — quindi mostra il
  genere su **tutto** il catalogo e non un sottoinsieme della lista corrente. La
  striscia è scorrevole col mouse (frecce + rotellina) e le pill che non
  restituiscono nulla si nascondono da sole.
- **Autenticazione** con modale login/registrazione; il token JWT viene salvato
  in `localStorage` e nello store Redux.
- **Notizie (F3)** con griglia articoli, riassunti AI **chiusi di default**
  ("Riassumi con AI" → "Mostra/Nascondi riassunto"), **filtro per titolo** e
  **caricamento incrementale** della lista. Il filtro è **server-side**
  (`GET /api/posts?title=…`, il parametro costruito in B2): cerca su tutta la
  tabella, non solo sugli articoli già scaricati. Le notizie si mostrano **6 alla
  volta** e lo scroll infinito (`IntersectionObserver`, più il pulsante "Mostra
  altre notizie" come fallback da tastiera) rivela la pagina successiva: la lista
  completa è quella che Redis ha **già in cache** (B3), quindi allargare la
  finestra non costa nessuna richiesta in più. La lista si **riallinea da sola
  ogni 5 minuti** (stessa cadenza del job di sync) mostrando "N di M notizie ·
  aggiornato alle HH:MM": nessun tasto di refresh manuale.
- **Account** con avatar compatto: un cerchio con l'iniziale apre il menu identità
  (nome utente, e-mail, "Installa app" quando disponibile, "Esci"), così l'indirizzo
  non occupa più la barra di navigazione. Gli ospiti, che non hanno il menu, vedono
  l'icona di installazione direttamente nella barra: installare è un'azione del
  **dispositivo**, non dell'account.
- **Accessibilità (F5)**: i testi rispettano il contrasto **WCAG 2.1 AA** (≥ 4,5:1)
  — i grigi `slate-500/600` restano solo su icone decorative e controlli
  disabilitati, esenti dal criterio — l'**anello di focus è sempre visibile** su
  ogni controllo (una sola regola `:focus-visible` non-layerata, che prevale anche
  sulle utility `outline-none`) e le card sono **attivabili da tastiera** con
  Invio/Spazio e `aria-label` \"Ascolta X\" / \"Metti in pausa X\". Le notizie hanno
  skeleton coerenti con la griglia delle radio.

## Script frontend

| Script              | Descrizione                            |
| ------------------- | -------------------------------------- |
| `npm run dev`       | Dev-server Vite con proxy `/api`       |
| `npm run build`     | Type-check (`tsc --noEmit`) + build    |
| `npm run typecheck` | Solo controllo dei tipi                |
| `npm test`          | Test dei componenti (Vitest + Testing Library) |
| `npm run test:watch` | Test in watch mode                    |
| `npm run preview`   | Serve la build di produzione            |
| `npm run lint`      | ESLint 10 (flat config) + regole React  |
| `npm run lint:fix`  | ESLint con correzione automatica        |
| `npm run format`    | Prettier sulla cartella `frontend/`     |
| `npm run format:check` | Verifica la formattazione            |

## Qualità del codice (D3)

- **TypeScript strict** su entrambi i package, con `noUncheckedIndexedAccess`:
  un indice di array o una proprietà opzionale non si possono usare senza averli
  controllati.
- **ESLint 10** in *flat config* (`backend/eslint.config.mjs` e
  `frontend/eslint.config.mjs`): `js.configs.recommended` +
  `typescript-eslint/recommended`, più le regole scelte per questo progetto:
  - `@typescript-eslint/no-explicit-any` è un **errore**: è la richiesta
    letterale di D3, *nessun `any` non motivato*;
  - `no-console` è un errore **ovunque tranne** in `src/utils/logger.ts`, l'unico
    punto in cui si deve scrivere sulla console;
  - sul frontend sono attive le due regole di `react-hooks` e
    `react-refresh/only-export-components`. Quest'ultima produce **warning
    motivati** su `GenrePills`, `SleepTimer` e `Toast`, che esportano costanti e
    hook accanto al componente di proposito: la motivazione è scritta nel file;
  - `public/sw.js` riceve le globali del *service worker* (`self`, `caches`,
    `fetch`), altrimenti sarebbe soltanto una lista di falsi positivi.
- **Prettier 3** con una configurazione unica alla radice (`.prettierrc.json`:
  apici singoli, punto e virgola, virgole finali, 80 colonne) e un
  `.prettierignore` che esclude ciò che **non è codice nostro**: il client Prisma
  generato e il bundle **vendorizzato** di RapiDoc
  (`backend/public/rapidoc-min.js`) non vanno riformattati, e la formattazione
  non deve mai produrre modifiche a un file che non abbiamo scritto.
- **La prosa resta a mano**: `*.md` è escluso da Prettier con una motivazione
  scritta in `.prettierignore`. I documenti sono parte del prodotto e vengono
  riletti riga per riga: far loro riscrivere tabelle e rientri produrrebbe un diff
  illeggibile senza alcun guadagno.
- **I due strumenti non si contraddicono**: `eslint-config-prettier` chiude la
  catena di configurazione e spegne le regole di formattazione di ESLint, così
  l'unico responsabile dello stile è Prettier.

```bash
cd backend  && npm run lint && npm run format:check
cd frontend && npm run lint && npm run format:check
```

Gli stessi due comandi girano in **CI** a ogni push e pull request, prima di
typecheck, test e build.

## Test (D4)

```bash
cd backend  && npm test    # 97 test: unitari + integrazione (Vitest + Supertest)
cd frontend && npm test    # 13 test: componenti (Vitest + React Testing Library)
```

**Backend** — unitari su filtro, cache e riassunto, più integrazione sugli
endpoint con `supertest`. I due test che interrogano davvero la fonte radio hanno
un timeout esplicito più alto: l'upstream può rispondere lentamente al primo giro,
quando la cache Redis è fredda.

**Frontend** — ambiente `jsdom`, `@testing-library/react` per gli interrogatori e
`user-event` per le interazioni. I due componenti richiesti da D4 sono coperti
**per comportamento**, non per markup:

- **ricerca** (`SearchBar`): al montaggio chiede la classifica di base
  (`limit=50`, nessuna query); **dopo la pausa di digitazione** chiede invece il
  testo cercato (`q=jazz`, `limit=20`); digitare riporta la pill su "Tutti";
  svuotare il campo torna subito alla classifica, senza attendere la pausa. La
  pausa di digitazione è parte del requisito, quindi i test usano i **timer
  veri** con `waitFor` e non una loro imitazione;
- **player** (`Player`): senza stazione non renderizza nulla; mostra nome e
  controlli; il pulsante di play **avvia davvero il flusso** (viene verificata la
  `play()` sull'elemento audio) e diventa "Pausa"; la **barra spaziatrice** mette
  in pausa; il tasto di chiusura svuota lo stato e fa sparire la barra; il volume
  aggiorna lo stato in scala 0-1; una sorgente **`.m3u8` passa da hls.js** mentre
  una diretta finisce nell'elemento audio.

Le due cose che jsdom non ha — la riproduzione dei media e
`IntersectionObserver` — sono stubbate **una volta sola** in `tests/setup.ts`,
non test per test. `hls.js` è simulato: in jsdom non può funzionare, e il test
verifica che il Player lo **usi** per gli stream HLS.

Lo `store` espone anche una factory (`createStore`): così ogni test parte da uno
stato pulito invece di condividere il singleton dell'app.

## Fonte radio (B1)

La ricerca radio parla prima con **FM-World**, la fonte indicata dalla traccia:
`GET {FM_WORLD_API_BASE_URL}/radios?query=<testo>&limit=<n>` con
`Authorization: Bearer <token>`. Il token sta **solo lato server** (variabile
d'ambiente: mai nel bundle del frontend, mai in una risposta, mai nel
repository — `.env` è ignorato da git).

Ogni risposta dichiara **chi ha risposto per davvero**:

```json
{
  "meta": {
    "source": "radio-browser",
    "fallback": {
      "from": "fm-world",
      "to": "radio-browser",
      "reason": "HTTP 403"
    }
  }
}
```

`meta.source` è la fonte che ha prodotto i dati; `meta.fallback` è valorizzato
quando la ricerca **non** è passata dal percorso primario e ne dice il motivo.
Le stesse informazioni sono negli header `X-Radio-Source` e `X-Cache`.

Tre scelte dichiarate:

- **Il fallback non è silenzioso.** Un fallback invisibile sarebbe
  indistinguibile da un provider che funziona: la risposta dice sempre da dove
  arrivano i dati e perché è stato usato il fallback, e ogni fallback finisce nei
  log strutturati (`FM-World failed: falling back to Radio Browser` + `reason`).
- **Radio Browser resta configurato per i due casi che FM-World non copre**: le
  pill di genere usano filtri (`tag`, `countryCode`, `bitrateMin`, `order`) che
  l'API di FM-World non espone — espone solo `query` e `limit` — e preferiti e
  cronologia hanno bisogno di una ricerca **per id**, che su FM-World non esiste.
- **Il fallback è automatico** su token mancante, `401`/`403`, timeout e payload
  inatteso. Se cadono entrambe le fonti la risposta resta quella richiesta dalla
  traccia: `502` fonte non raggiungibile, `504` timeout.

**Misura sul campo** (riproducibile): con il token fornito con il documento,
`connect.fm-world.com/client2/radios?query=jazz&limit=2` risponde
**`403 Forbidden`**; senza header, **`401 Invalid authorization token`**. Il
token è quindi riconosciuto ma non autorizzato (scaduto, oppure senza permessi
su quell'endpoint): è il motivo per cui l'app espone `fallback.reason = "HTTP
403"` e continua a funzionare. Con un token valido il percorso primario si
attiva **senza modificare una riga**.

## Ingestione delle notizie (B2)

Il backend è l'unico punto di accesso alle fonti esterne: il feed notizie
(`NEWS_FEED_URL`, default `https://d3r6kmd22dkoyn.cloudfront.net/`, JSON in stile
WordPress REST) **non viene mai letto dal browser**. Il ciclo di vita è:

1. **Sincronizzazione** — `src/services/newsSyncService.ts` scarica il feed
   all'avvio del backend e poi ogni `NEWS_SYNC_INTERVAL_SECONDS` (default 300 s =
   5 minuti, come l'esempio della traccia) con un `setInterval` "unref" che viene
   azzerato nello shutdown.
2. **Normalizzazione** (`mapFeedItem`) — `id` → `externalId`; `title.rendered` /
   `content.rendered` → testo semplice (tag rimossi, entità HTML decodificate,
   `<p>`/`<br>` convertiti in a capo); `date_gmt` → `publishedAt` (letta come UTC,
   con fallback su `date`). Gli elementi senza id numerico, senza titolo o con
   `status` diverso da `publish` vengono scartati e contati in `skipped`.
3. **Deduplica** — l'upsert è chiavi in `externalId` (colonna `@unique`): una
   seconda esecuzione aggiorna le righe esistenti invece di duplicarle
   (`created: 0, updated: N`). Il campo `summary` **non viene mai sovrascritto**,
   così un riassunto AI già generato sopravvive alle sincronizzazioni successive.
4. **Robustezza** — timeout di 15 s sul download, errore loggato (senza crash) su
   HTTP non-2xx o payload inatteso, guardia in memoria contro sync concorrenti
   (`409` dalla rotta manuale).
5. **Cache-buster sull'URL del feed** — l'edge CDN davanti al feed ha servito per
   **~12 ore** lo stesso snapshot (`X-Cache: Hit from cloudfront`, `Age: 42558`)
   pur essendo l'origine marcata `no-store, private, max-age=0`: ogni sync
   riportava `fetched: 10, created: 0` e **nessun articolo nuovo entrava**.
   Misurato: gli header `Cache-Control: no-cache`/`Pragma` e l'opzione
   `cache: 'no-store'` **non cambiano la risposta** (resta `Hit`); solo un **URL
   diverso** la trasforma in `Miss`. La richiesta aggiunge quindi
   `?_cb=<timestamp>` (`withCacheBuster`): l'origine lo ignora, l'edge no.

Sincronizzazione manuale:

```bash
curl -X POST http://localhost:4000/api/sync -H "X-Sync-Key: <SYNC_API_KEY>"
# → {"data":{"fetched":10,"created":0,"updated":10,"skipped":0}}
```

La rotta è protetta dall'header `X-Sync-Key` (confronto constant-time): risponde
`401` con chiave errata e `503` quando `SYNC_API_KEY` non è configurata
(fail-closed, così l'endpoint non resta mai aperto per errore).

Lettura dei post:

```bash
curl "http://localhost:4000/api/posts"                     # lista completa (cache Redis)
curl "http://localhost:4000/api/posts?title=radio&items=5" # filtro parziale + limite
```

`title` è un filtro parziale case-insensitive, `items` limita i risultati
(1-100; è accettato anche l'alias `limit`). Parametri non validi → `400` con i
dettagli del campo.

## Strategia di cache (B3)

| Risorsa | Chiave Redis | TTL | Invalidazione |
| ------- | ------------ | --- | ------------- |
| `GET /api/radios` | `radios:search:q=…&limit=…&page=…` | `RADIO_CACHE_TTL_SECONDS` (600 s) | scadenza TTL |
| `GET /api/posts` (lista senza filtri) | `posts:list` | 600 s | `DEL` dopo ogni sync riuscita |

- **Read-through**: al `MISS` la risposta arriva da PostgreSQL e viene salvata in
  Redis; al `HIT` viene servita dalla cache senza toccare il database.
- **Invalidazione esplicita** — è il punto centrale di B3: al termine di ogni
  sincronizzazione (periodica o manuale) `postsCache.invalidatePostsCache()`
  cancella `posts:list`, quindi la `GET` successiva ricalcola la lista aggiornata.
  Il TTL resta come rete di sicurezza se una sync fallisce prima della `DEL`.
- **Le query filtrate non usano la cache**: `?title=` e `?items=` vanno sempre su
  PostgreSQL, perché `posts:list` vale solo per la lista completa (stesso criterio
  "una chiave per query" usato per le radio).
- **La cache non è una dipendenza**: ogni errore Redis è non bloccante, viene
  loggato un warning e la richiesta prosegue sul database.

## Riassunti AI (A1–A3)

`GET /api/posts/:id/summary` (e `POST`, usato dalla SPA) restituisce il riassunto
in italiano di un post: **la prima richiesta lo genera e lo salva** in
`Post.summary`, le successive non richiamano più il modello (controllo dei costi).

Il provider si sceglie da variabile d'ambiente (`SUMMARY_PROVIDER`):

| Valore | Comportamento |
| ------ | ------------- |
| `auto` (default) | Gemini se `GEMINI_API_KEY` è configurata, altrimenti OpenAI, altrimenti mock |
| `gemini` / `openai` | forza il provider; senza la sua chiave degrada al mock con un warning |
| `mock` | provider offline deterministico: nessuna chiave, utile per i test |

- **Dove mettere la chiave**: per lo stack **Docker** nella **root `.env`**
  (è il file che `docker-compose.yml` passa al container: dopo la modifica serve
  `docker compose up -d backend`, senza `--build`); per lo sviluppo locale con
  `npm run dev` in `backend/.env`. `.env.example` è solo un modello: non viene
  mai letto dall'app né da Docker.
- **Prompt** (Gemini/OpenAI): *"Sei un giornalista italiano. Riassumi in 2-3 frasi
  chiare e scorrevoli… Rispondi solo con il riassunto"*. Il modello è chiamato
  **solo dal backend**, con `temperature 0.3`, timeout di 15 s e un tetto di
  `maxOutputTokens` (1000); il nome del modello è sovrascrivibile con
  `SUMMARY_MODEL` (**default `gemini-2.5-flash`**, verificato contro l'API reale:
  l'alias `gemini-flash-latest` rispondeva `503 high demand`, e la versione
  `gemini-1.5-flash` non è più servita). Sui modelli *flash* di Gemini il
  `thinkingBudget` è azzerato: i token di ragionamento consumavano il budget di
  output e il riassunto veniva troncato dopo poche parole.
- **Errori transitori**: su `429`/`503` la chiamata viene **ritentata una volta**
  dopo 1,5 s (i piani gratuiti rispondono *"model is currently experiencing high
  demand"*); solo se anche il retry fallisce si passa al provider offline.
- **Prompt injection**: titolo e testo dell'articolo sono racchiusi tra
  `<<<ARTICOLO>>>` e `<<<FINE_ARTICOLO>>>`; **i delimitatori presenti nel contenuto
  vengono rimossi**, quindi un articolo non può "chiudere" il blocco, e il prompt
  dichiara esplicitamente che quel testo è un dato di cui ignorare le istruzioni.
- **Testi troppo lunghi**: l'articolo è troncato a `SUMMARY_MAX_INPUT_CHARS`
  (default 6000) su un confine di parola, così un post enorme non può gonfiare
  contesto e costi.
- **Errori e timeout**: HTTP non-2xx, timeout o risposta vuota → warning loggato e
  fallback al provider offline: l'endpoint risponde comunque `200`, l'app funziona
  anche senza chiavi.
- **Coerenza**: se il feed riscrive titolo o contenuto di un articolo, la sync
  azzera il `summary` salvato (e le righe per-utente) e il riassunto viene
  rigenerato alla richiesta successiva.
- **Un solo costo per articolo (ibrido)**: il testo è generato **una volta** e poi
  condiviso. Il primo che chiede paga la chiamata e il testo finisce **sia** nella
  sua riga **sia** nella cache pubblica; chi arriva dopo — un altro utente o un
  ospite — lo **adotta** con una semplice copia, **senza chiamare il modello**.
  La visibilità resta per-utente: nella lista `summary` è valorizzato solo per chi
  quel riassunto l'ha chiesto o adottato.
- **Limite dichiarato**: due utenti che chiedono lo *stesso* articolo mai riassunto
  nello stesso istante possono generare due chiamate (race); l'`upsert` evita
  duplicati in tabella, non l'eventuale doppia generazione.
- **Anche la bio delle stazioni** (bonus "Info AI", `POST /api/ai/radio-info`) usa
  lo stesso modello e lo stesso accorgimento (`thinkingBudget: 0`, altrimenti i
  token di ragionamento troncano il testo), con timeout di 10 s e un retry sui
  `503`; in caso di errore resta il testo di fallback costruito lato server.

## Dati per utente (B4/F4)

Ogni utente autenticato ha **i propri** preferiti, la **propria** cronologia di
ascolto e i **propri** riassunti. Gli ospiti continuano a usare l'app: la libreria
resta sul dispositivo (localStorage) e i riassunti nelle cache pubbliche.

| Dato | Autenticato | Ospite |
| ---- | ----------- | ------ |
| Preferiti | tabella `Favorite` (`userId` + `@@unique([userId, radioId])`) via `GET\|POST\|DELETE /api/favorites` | localStorage `radiohub:favorites:v1` |
| Cronologia ascolti | tabella `RecentPlay` (max 10, `upsert` a ogni ascolto) via `GET\|POST\|DELETE /api/recents` | localStorage `radiohub:recents:v1` |
| Riassunti | tabella `PostSummary` (`@@unique([postId, userId])`, **testo adottato dalla cache condivisa**) | `Post.summary` (cache condivisa) + localStorage `radiohub:summaries:v1` |

**Al login** il dispositivo apre la libreria dell'account (slot
`radiohub:favorites:v1:u:<userId>` e `…recents:v1:u:<userId>`), **adottando** i dati
dell'ospite la prima volta (vengono spinti sul server) e poi svuotando lo slot
ospite: così un **altro** account che entra dopo parte dai suoi dati e non eredita
quelli di qualcun altro. **Al logout** si torna allo slot ospite (nel frattempo
vuoto): la lista cambia davvero, i dati dell'account restano sul server.

Le stazioni dell'account che questo dispositivo non conosce vengono risolte da
`GET /api/radios/by-ids` (proxy con cache Redis), così le card si renderizzano
sempre.

Anche la **lista dei post** è per-utente: `GET /api/posts` con token restituisce il
**tuo** riassunto per ogni articolo (la cache Redis è disattivata in quel caso,
per non mescolare i dati fra utenti); senza token restituisce la cache condivisa.

**Al logout non si cancella niente**: finisce solo la sessione, i dati restano sul
dispositivo e sul server. Per questo l'intestazione della sezione dice
*"Sincronizzati con l'account"* oppure *"Su questo dispositivo"*, e l'unica azione
distruttiva è esplicita (**"Svuota preferiti"**, con conferma a due passaggi).

I riassunti sono **chiusi di default**: il pulsante è `Riassumi con AI` (genera e
apre), poi diventa `Mostra riassunto` / `Nascondi riassunto`. Un riassunto che
esiste già — tuo o in cache — si apre **senza chiamare il modello**.

## Documentazione API (B5)

La specifica OpenAPI 3.1 dell'intera API è servita **dal backend**, quindi è
sempre allineata al codice in esecuzione (non è un file separato da aggiornare):

| Rotta                 | Cosa restituisce                                                     |
| --------------------- | -------------------------------------------------------------------- |
| `GET /api/docs`       | Interfaccia interattiva **RapiDoc** (prova le chiamate dal browser)   |
| `GET /api/openapi.json` | Documento OpenAPI 3.1: 15 path, 13 schemi, 7 risposte riusabili     |

Due scelte motivate:

- **Il bundle di RapiDoc è vendorizzato** in `backend/public/rapidoc-min.js`
  (licenza MIT, autore nell'header del file) e servito dalla **stessa origine**:
  la pagina funziona **senza internet** e senza CDN di terze parti, coerente con
  la promessa "parte con `docker compose up` su una macchina con solo Docker".
  Il Dockerfile lo copia nell'immagine (`COPY public ./public`).
- **La pagina usa l'elemento che il bundle registra davvero**: il bundle RapiDoc
  9.x definisce `<rapi-doc>` (il vecchio nome `<rapidoc>` **non** è registrato —
  usarlo produce una **pagina bianca senza alcun errore**, che è esattamente il
  bug trovato e corretto qui: verificato aprendo la pagina in un Chrome headless
  e ispezionando il custom element). Il test non confronta una stringa
  scritta a mano: estrae i nomi dai `customElements.define()` del bundle servito
  e verifica che il tag della pagina sia fra quelli.
- **La pagina ha una CSP dedicata**: RapiDoc costruisce l'interfaccia in uno
  *shadow root* con stili inline, quindi la policy globale di helmet la
  bloccherebbe. La policy della sola `/api/docs` è dichiarata con
  `useDefaults: false` — niente direttive aggiunte di nascosto, `'unsafe-inline'`
  solo per gli stili, script e connessioni `'self'`, e **niente
  `upgrade-insecure-requests`** che romperebbe la pagina su `http://localhost`.

La specifica è verificata dai test (`backend/tests/docs.test.ts`): ogni endpoint
esposto dall'app deve comparire nel documento, tutti i `$ref` devono risolvere e
il bundle deve essere servito — così documentazione e codice non possono
divergere in silenzio.

**Qualità della specifica**: `npx @redocly/cli lint` sul documento servito
restituisce **0 errori**. Restano 5 warning, tutti accettati e motivati:
`no-server-example.com` (×2 — i server sono `http://localhost:4000` e `:8080`,
perché è così che parte il progetto) e `operation-4xx-response` (×3 — sugli
endpoint `/`, `/api/health` e `/api/health/ready`, che per definizione non
possono rispondere 4xx).

## Sicurezza e quote (X6)

`helmet()` e CORS sono attivi fin dalla prima versione; con X6 si aggiungono il
**rate limiting** e il **refresh token**.

### Rate limiting

Contatori su **Redis** (non in memoria: con più istanze del backend ogni istanza
avrebbe la propria quota, cioè una quota moltiplicata per il numero di istanze) a
finestra fissa, `INCR` + `TTL`. Tre quote, tutte configurabili da ambiente:

| Quota | Default | Perché |
| --- | --- | --- |
| Generale `/api` | 300/min per IP | uso normale senza intralci |
| `login` + `register` | 10 ogni 15 min per IP | forza bruta sulle password |
| Riassunti AI | 20 ogni 5 min per **utente** | è l'unica chiamata che costa |

Dettagli che contano:

- **IP reale dietro nginx**: `app.set('trust proxy', 1)` in `app.ts`.
  `frontend/nginx.conf.template` accoda `$remote_addr` a `X-Forwarded-For`, quindi Express
  legge l'ultimo valore dell'header — quello aggiunto dal proxy. Senza quella
  riga `req.ip` sarebbe l'IP del container del frontend per **tutti** i client e
  la quota generale diventerebbe un'unica quota condivisa. Un
  `X-Forwarded-For` falsificato dal client finisce più a sinistra e non sposta la
  chiave.
- **Health e docs fuori quota**: i limiter sono montati dopo `/api/health` e
  `/api/docs`, così l'healthcheck di Docker non può restare bloccato da un client
  rumoroso.
- **IPv4 e IPv6 normalizzati**: Node presenta un IPv4 su socket dual-stack come
  `::ffff:172.21.0.1`. Senza normalizzare, lo stesso client otterrebbe **due
  quote diverse** passando dal proxy (`172.21.0.1`) o da una connessione diretta
  (`::ffff:172.21.0.1`): difetto trovato in verifica leggendo le chiavi in Redis,
  non previsto a tavolino, e ora coperto da un test.
- **Fail-open dichiarato**: se Redis non risponde la richiesta passa e l'evento
  finisce nei log come `WARN`. È la stessa scelta della cache (B3): un Redis giù
  peggiora il servizio, non lo spegne.
- **Risposta `429`** con `Retry-After` e `RateLimit-Limit` / `-Remaining` /
  `-Reset` (bozza IETF): un client sa quando riprovare invece di ritentare a caso.
- **Nei test le quote sono alzate** (`vitest.config.ts`): la suite fa centinaia di
  richieste dallo stesso IP e con le quote reali fallirebbe per `429` su motivi
  che non sta verificando. Le soglie vere — `429` compreso — sono coperte da
  `tests/rateLimit.test.ts`, che istanzia il middleware con i propri valori e uno
  store iniettato.

### Refresh token

Il JWT resta breve (1 h) e **non** viene allungato: si aggiunge un secondo
gettone, opaco (32 byte casuali, non un JWT) e **monouso**, salvato in Redis
**hashato** (SHA-256) — così un dump di Redis non consegna sessioni utilizzabili.

- `POST /api/auth/login` restituisce `token` + `refreshToken`.
- `POST /api/auth/refresh` consuma il gettone e ne emette uno nuovo: è la
  **rotazione**, e un gettone già usato riceve `401` (il riuso di un gettone
  intercettato non funziona).
- `POST /api/auth/logout` lo revoca lato server: prima di X6 il logout era solo
  lato client e il JWT restava valido fino a scadenza.
- Il frontend rinnova **in modo trasparente**: un `401` su una rotta applicativa
  innesca un solo rinnovo (più `401` simultanei condividono la stessa richiesta),
  poi la richiesta originale viene ripetuta **una volta**. Il rinnovo salta le
  rotte `/auth/*` (lì un `401` significa "credenziali sbagliate") e un guasto
  temporaneo (`503`) **non** chiude la sessione: si chiude solo se il server
  rifiuta il gettone (`400`/`401`), e in quel caso lo store Redux viene avvisato
  con un callback registrato in `main.tsx`.

## Ricerca in linguaggio naturale (X3)

`POST /api/radios/search` prende una frase in italiano e restituisce i **filtri**
che `GET /api/radios` sa già applicare — non le stazioni. Il client rifà la
ricerca con quei filtri, quindi cache (B3), fonti (B1) e validazione restano una
sola implementazione; e l'utente **vede cosa è stato capito** (i filtri compaiono
come chip sotto la barra) e può correggerlo.

```bash
curl -X POST http://localhost:8080/api/radios/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"voglio una radio jazz italiana"}'
```

```json
{
  "data": {
    "originalQuery": "voglio una radio jazz italiana",
    "filters": { "tags": ["jazz"], "countryCode": "IT", "order": "votes" },
    "source": "ai",
    "provider": "gemini",
    "matched": ["italiana", "jazz"],
    "note": "Ricerca radio jazz italiane.",
    "fallbackReason": null
  }
}
```

Due strade, nello spirito di A2:

1. **modello** (`services/modelClient.ts`, condiviso con i riassunti): risposta
   **JSON validata con Zod**. Fuori schema, senza chiave o con errore di rete non
   si risponde con un errore, si passa alla strada 2;
2. **regole deterministiche** (`services/naturalSearchService.ts`): dizionari di
   **paesi** (nome in italiano → codice ISO) e **generi** — le stesse catene di
   tag delle pill — più indizi su ordinamento e qualità. Funziona offline, quindi
   la funzione non dipende da un servizio esterno per esistere.

La risposta dichiara **quale** delle due ha risposto (`source`) e il motivo del
passaggio alle regole (`fallbackReason`). Verificato dal vivo, stessa frase:

| Configurazione | `source` | Filtri risultanti |
| --- | --- | --- |
| `SUMMARY_PROVIDER=auto` con chiave | `ai` (`gemini`) | `tags: [jazz]`, `IT`, `votes` |
| `SUMMARY_PROVIDER=mock` | `rules` (`no-provider`) | `tags: [jazz, blues, soul, funk]`, `IT`, `votes` |

Dettagli che contano:

- **Difesa da prompt injection (A3)**: il testo dell'utente viaggia fra due
  delimitatori, l'istruzione ordina di ignorare qualsiasi cosa contengano, e i
  delimitatori **vengono rimossi** dal testo prima della chiamata.
- **Il residuo non sporca la query**: "una radio jazz italiana per rilassarmi"
  produce `tags: jazz` + `IT` e **non** una query di nome con "per rilassarmi",
  che azzererebbe i risultati. Il testo libero diventa `q` solo se non sono stati
  riconosciuti né tag né paese ("radio deejay" → `q: deejay`).
- **Vocabolario coerente**: le catene di tag sono le stesse di `GenrePills.tsx`,
  quindi "musica dance" e la pill Dance chiedono la stessa cosa.
- **Quota dedicata** (`nl-search`, 20 ogni 5 minuti per utente o IP), separata da
  quella dei riassunti: chiama il modello, e un bucket non deve bloccare l'altro.
- **Nota dichiarata**: `aiService.ts` (bio delle radio, A1–A3) mantiene la propria
  chiamata al provider invece di usare `modelClient`. È una duplicazione nota:
  unificarla tocca un percorso chiuso e testato senza guadagno funzionale, e
  `modelClient` è nato anche per assorbirla in un secondo momento.

## Notizie in tempo reale (X5)

`GET /api/posts/stream` è un flusso **SSE**: all'apertura annuncia il `retry`
(10 s) e manda un evento `ready`; ogni sincronizzazione che inserisce o aggiorna
post pubblica poi un evento `posts` con `{ created, updated, at }`. Il frontend si
riallinea subito e avvisa il lettore, invece di attendere il polling di sicurezza
(5 minuti), che resta in piedi come rete di sicurezza.

```bash
curl -N http://localhost:8080/api/posts/stream
# retry: 10000
#
# event: ready
# data: {"clients":1}
# (a ogni sincronizzazione con novità)
# event: posts
# data: {"created":2,"updated":0,"at":"2026-10-10T12:00:00.000Z"}
```

**SSE e non WebSocket**: il flusso è a senso unico (il server annuncia, il client
non invia nulla), è HTTP puro — nessuna libreria, nessun upgrade di protocollo da
configurare nel proxy — e nel browser la **riconnessione è automatica**, guidata
dal `retry` annunciato. Con un WebSocket avrei dovuto scrivere e testare a mano la
riconnessione.

**La distribuzione passa da Redis pub/sub** (`src/realtime/postEvents.ts`), non da
un array in memoria: il backend può girare su più istanze — è la ragione per cui
anche la cache di B3 sta in Redis — e un client collegato all'istanza A deve
ricevere un evento prodotto dall'istanza B. Il subscriber usa una connessione
dedicata (`redis.duplicate()`): in `subscribe` una connessione si blocca sul canale
e non può più servire la cache né i contatori del rate limiting.

Dettagli che contano, o l'SSE non funziona dietro un proxy:

- **`X-Accel-Buffering: no` + `proxy_buffering off`**: senza questi due, nginx
  accumula la risposta in un buffer e gli eventi arrivano solo alla chiusura della
  connessione, cioè mai. In `frontend/nginx.conf.template` c'è una `location
  /api/posts/stream` dedicata (prefisso più specifico, quindi vince sul `/api/`
  generico) con `proxy_read_timeout 1h`;
- **heartbeat ogni 25 s**: un **commento** SSE (`: ping`), che non genera eventi
  ma tiene la connessione viva oltre il `proxy_read_timeout` del proxy;
- **l'evento si pubblica solo se qualcosa è cambiato** (`created > 0 || updated > 0`):
  altrimenti ogni sync — anche senza novità — riallineerebbe la lista di tutti i
  client cinque volte l'ora;
- **il flusso è pubblico come `GET /api/posts`**: gli articoli si leggono anche da
  ospiti, ed `EventSource` non sa inviare header di autenticazione;
- **un socket morto viene tolto dal registro** alla prima scrittura fallita e alla
  chiusura della richiesta (`req.on('close')`), così non resta lì a fallire a ogni
  evento.

**Verifica dal vivo**, nginx in mezzo e `redis-cli PUBLISH` al posto del job:

```
$ curl -N http://localhost:8080/api/posts/stream
retry: 10000

event: ready
data: {"clients":1}

event: posts
data: {"created":2,"updated":0,"at":"2026-10-10T12:00:00.000Z"}
```

e nei log del backend: `Post event delivered {"created":2,"updated":0,"clients":1}`.
(La stessa catena è già scattata da sola all'avvio, con `updated:10` dalla
sincronizzazione iniziale del feed.)

**Limiti dichiarati**: se Redis è giù il flusso resta muto — l'evento non viaggia
più fra le istanze — ma l'app continua, perché la lista si riallinea con il
polling e il pubblicatore non lancia (una sincronizzazione riuscita non deve
fallire per colpa dell'annuncio). E il flusso è "best effort": nessuna garanzia di
consegna, nessuna coda per chi era disconnesso.

## Domande sulle notizie (X4)

`POST /api/posts/ask` risponde a una domanda in italiano sul corpus delle notizie
e restituisce **le fonti**: i passaggi usati (`sources`) e gli `id` che il modello
dichiara di aver citato (`citationIds`).

```bash
curl -X POST http://localhost:8080/api/posts/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"cosa è successo a Federico l’Olandese Volante?"}'
```

Risposta reale, con il modello configurato:

```
source=ai  provider=gemini  citazioni: b82702ed…, 09096058…

"Federico Van Stegeren, noto come Federico l'Olandese Volante, è morto all'età di
 76 anni, causando un'ondata di cordoglio nel mondo della radiofonia italiana."

[0.066] Federico l'Olandese Volante, il ricordo della radiofonia…         ← citata
[0.062] Addio a Federico l'Olandese Volante, una vita dedicata alla radio ← citata
[0.013] RTL 102.5 è la radio ufficiale del Milano Premier Padel P1 2026   ← contesto
```

**Retrieval lessicale, non vettoriale — e perché.** Il corpus sono poche decine di
articoli: un indice con embedding su così pochi documenti non migliorerebbe i
risultati e renderebbe il comportamento non deterministico e non verificabile. Il
punteggio è **TF-IDF** (frequenza del termine nell'articolo, normalizzata sulla
lunghezza, moltiplicata per quanto il termine è raro nel corpus), il titolo pesa
doppio, e la citazione è la **frase** con più termini della domanda — non una
finestra fissa di caratteri, che taglierebbe le frasi a metà. Con un corpus grande
la struttura regge, ma il caricamento dei candidati dovrebbe passare a una query
SQL: è fra i limiti noti.

**Le citazioni non sono decorative.** Il modello riceve *solo* i passaggi
recuperati, risponde in JSON e gli `id` che dichiara vengono **filtrati contro le
fonti realmente recuperate**: un id inventato non entra nella risposta.
Nell'esempio il terzo passaggio è rumore (score 0.013) e infatti **non** è citato:
la differenza fra "recuperato" e "usato" resta visibile a chi legge.

**Degradazione dichiarata**: senza modello — o se la risposta non è conforme allo
schema — la rotta risponde comunque con i passaggi pertinenti, `source:
"retrieval"` e il motivo in `fallbackReason`. Se nessun passaggio è pertinente
(`no-match`) il modello non viene nemmeno chiamato: non c'è nulla su cui
rispondere, e non si paga una chiamata per scoprirlo.

- Difesa da prompt injection come in A3/X3: la domanda viaggia fra delimitatori e
  i marcatori vengono rimossi dal testo prima della chiamata.
- Quota dedicata `news-ask`, separata da `ai-summary` (riassunti) e `nl-search`
  (ricerca naturale).
- 16 test backend (retrieval puro su corpus fisso, orchestrazione con modello
  iniettato, validazione della rotta) + 4 frontend sul pannello.

## Test end-to-end (X8)

`frontend/e2e/` contiene un test Playwright che percorre il flusso della traccia —
**cerca → ascolta → preferiti** — contro la **stack reale** (`docker compose up`:
nginx, backend, Postgres, Redis), non contro un dev server.

```bash
docker compose up -d --wait   # la stack deve essere su
cd frontend
npm run test:e2e              # oppure: npx playwright test
```

Il test registra un account, fa login, cerca «jazz», avvia la riproduzione, mette
la stazione nei preferiti e **ricarica la pagina** verificando che il preferito
ci sia ancora — cioè che sia salvato sul server, non solo nello stato di React.

Cosa è reale e cosa è controllato (la distinzione è il punto):

| Reale | Controllato, per non dipendere dal mondo esterno |
| --- | --- |
| nginx, backend, Postgres, Redis, autenticazione (bcrypt + JWT), preferiti e loro persistenza, ricerca, player | il **catalogo radio** (una stazione fissa) e il **trasporto audio** (un WAV di silenzio generato nel test) |

Un E2E che si rompe perché una stazione pubblica è offline non sta misurando il
nostro codice, sta misurando internet. L'audio è un WAV di silenzio generato al
volo, così il player arriva davvero allo stato "in onda" e il test verifica anche
che il media element **non sia in pausa**: l'ascolto è reale, non un'etichetta.

Il workflow **`e2e.yml` è separato** dal CI principale: l'E2E avvia quattro
container e scarica un browser, quindi è più lento e più esposto, e un suo rosso
non deve far apparire rotto un progetto i cui test veloci sono verdi. Gira sulle
pull request e a mano — non sulle push — così `main` conserva un solo check di
riferimento; in caso di fallimento carica traccia e screenshot come artefatto.

**Quello che il primo giro ha trovato** (ed è il motivo per cui si scrivono gli
E2E): i selettori `'Accedi'` e `'Registrati'` corrispondevano **due volte** — al
pulsante di invio e alla voce "Non hai un account? Registrati" — e dopo aver messo
una stazione nei preferiti lo stesso pulsante esiste in due punti (griglia e
sezione preferiti). Erano ambiguità del test, non difetti dell'app, ma sarebbero
rimaste invisibili senza un'esecuzione reale. Ora i selettori sono esatti e il
test gira due volte di fila in **4,7 s** e **4,9 s**.

## Deploy pubblico (X2)

La configurazione necessaria al deploy è fatta e **provata in locale**; i passi per
portare l'app su un URL pubblico sono in [`DEPLOY.md`](./DEPLOY.md) (Render +
`render.yaml`, con la strada manuale e le cinque cose che rompono un deploy).

Due modifiche sono servite davvero, e sono la ragione per cui la configurazione
locale e quella cloud ora sono **lo stesso artefatto**:

- **Il proxy di nginx è un template** (`frontend/nginx.conf.template`):
  `nginx:alpine` esegue `envsubst` all'avvio e sostituisce `BACKEND_HOST` /
  `BACKEND_PORT`. Prima l'indirizzo del backend era scritto dentro l'immagine e
  funzionava solo in Docker locale; ora la stessa immagine funziona in locale
  (`backend:4000`) e su un cloud (l'host interno del servizio).
- **`TRUST_PROXY` è configurabile**: in locale basta 1 hop (nginx del frontend), su
  una piattaforma cloud che mette un proprio edge davanti all'app ne servono 2. Con
  il valore sbagliato `req.ip` non è l'IP del client e il rate limiting conta la
  chiave sbagliata — un difetto che in locale non si vedrebbe mai.

**Stato**: `[~]`. Il deploy in sé non è stato eseguito perché creare l'account
richiede email e (su alcune piattaforme) carta. Un bonus X2 senza URL non è X2,
quindi la riga resta parziale finché l'URL non esiste e non è verificato.

## Limiti noti

- **B1 — token FM-World fornito non più valido**: il percorso primario esiste e
  viene tentato a ogni ricerca, ma il token del documento risponde `403
  Forbidden` (misurato; `401` senza token), quindi oggi ogni ricerca passa dal
  fallback Radio Browser con `fallback.reason = "HTTP 403"`. Domanda aperta per
  `nico.montanari@22hbg.it`: il token è scaduto o va richiesto con permessi
  diversi? Con un token valido non serve cambiare codice.
- **B1 — payload di successo di FM-World non osservabile**: proprio perché il
  token risponde `403` e l'endpoint non ha documentazione pubblica, la struttura
  della risposta non è verificabile. Il mapper è perciò **tollerante** (prova più
  nomi di campo) e un payload non riconosciuto non produce una lista vuota ma un
  fallback; i test unitari usano payload plausibili, non osservati.
- **B1 — parametro di ricerca**: accettati **sia `query`** (il nome usato dalla
  traccia) **sia `q`** (quello usato dal frontend), coperti dai test.
- **B1 — Radio Browser su un mirror singolo**: la ricerca usa
  `de1.api.radio-browser.info`, che sotto rate limit ha risposto `503` durante la
  verifica (→ `502` coerente verso il client). La documentazione di Radio Browser
  consiglia il nome `all.api.radio-browser.info` (round-robin sui nodi sani):
  cambiarlo è una variabile d'ambiente, non una modifica al codice.
- **Seed**: il seed crea **un solo** contenuto di esempio, dichiarato come tale
  ("non è una notizia reale"): le notizie arrivano dal feed, non da contenuti
  inventati. Il seed ora parte **automaticamente** all'avvio del backend (D1).
- **Riassunti senza chiave**: con `SUMMARY_PROVIDER=mock` o senza chiavi API il
  riassunto è prodotto dal provider offline e marcato con il prefisso
  `[MOCK SUMMARY]`, ripulito a video dal frontend. Per usare il modello reale basta
  configurare `GEMINI_API_KEY` o `OPENAI_API_KEY` (e, se serve, `SUMMARY_MODEL`).
- **X6 — il JWT non si revoca**: il logout cancella il refresh token, quindi la
  sessione non è più rinnovabile, ma l'access token **già emesso** resta valido
  fino alla sua scadenza (1 h). È il prezzo di un token senza stato; una revoca
  immediata richiederebbe una blacklist consultata a ogni richiesta (o sessioni
  server-side al posto dei JWT). Il comportamento è fissato da un test in
  `tests/refreshToken.test.ts` ("limite dichiarato"), così non è una svista.
- **X6 — rotazione senza "famiglia"**: un refresh token riutilizzato viene
  rifiutato, ma non revoco anche la sessione che ne è derivata: non traccio un id
  di famiglia per catena di rotazioni. Con il token hashato e di 32 byte, il
  gettone rubato è comunque monouso.
- **X6 — TTL non atomico**: `INCR` è atomico, la posa del TTL no: due primissime
  richieste nello stesso istante possono allungare la finestra di qualche
  millisecondo. È dichiarato nel codice e non è un modo per aggirare la quota
  (il contatore resta esatto).
- **X6 — finestra fissa, non sliding**: a cavallo fra due finestre si possono
  fare fino a `2 × max` richieste ravvicinate. Accettato e motivato: la finestra
  stretta (credenziali) dura 15 minuti, quindi il caso peggiore restano 10
  tentativi, e una finestra scorrevole costerebbe una struttura per richiesta.
