# RadioHub

Monorepo del progetto **RadioHub**.

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
