# RadioHub — Task & Stato: archivio dettagliato

> **Archivio.** Log dettagliato delle task: diagnosi, misure, prima/dopo e i
> "perché" delle scelte. Il riepilogo da leggere per primo è
> [`TASKS.md`](./TASKS.md).
>
> Il documento è in ordine di lavorazione e i numeri non sono in sequenza: le
> `4.x` sono cresciute nel tempo per strati, le `6.x` sono arrivate dopo e
> riguardano i requisiti della traccia. Il dettaglio è quindi storico, non
> tematico: per una vista per requisito si usa `TASKS.md`.


> Legenda: `[ ]` da fare · `[~]` in corso · `[x]` completata

---

## Milestone 1 — Setup & Infrastruttura

### Task 1.1 — Bootstrap del progetto e infrastruttura base [x]

- [x] Creare la struttura delle cartelle del progetto (`backend/`, `src/config`, `src/db`, `src/redis`, `src/routes`)
- [x] Inizializzare il backend Node.js + **TypeScript strict** (`tsconfig.json` con `strict` + controlli aggiuntivi)
- [x] Configurare `backend/.env.example` (app, PostgreSQL, Redis)
- [x] Creare `docker-compose.yml` base con **PostgreSQL 16** e **Redis 7**
- [x] Validazione delle variabili d'ambiente all'avvio (fail-fast con `zod`)
- [x] Endpoint di health-check: `GET /api/health` (liveness) e `GET /api/health/ready` (readiness)
- [x] Client PostgreSQL (`pg` pool) e Redis (`ioredis`) + graceful shutdown
- [x] `.gitignore`, `README.md`

### Task 1.2 — Configurazione Prisma ORM e Schema DB [x]

- [x] Installare `prisma` (dev) e `@prisma/client` + `@prisma/adapter-pg` (prod)
- [x] Inizializzare Prisma 7 con provider PostgreSQL (`prisma/schema.prisma` + `prisma7.config.ts`)
- [x] Definire i modelli `User`, `Favorite` (relazione verso `User` + `@@unique([userId, radioId])`) e `Post`
- [x] Singleton `PrismaClient` con driver adapter in `backend/src/db/prisma.ts`
- [x] Readiness check via Prisma (`prisma.$queryRaw`) in `GET /api/health/ready`
- [x] Eseguito `npx prisma generate` (client generato in `backend/src/generated/prisma`)

### Task 1.3 — Integrazione Redis [x]

- [x] Client Redis condiviso (`ioredis`) + graceful shutdown
- [x] Cache delle stazioni radio (chiave per query, TTL 600s) — implementato in Task 2.3

### Task 1.4 — Migrazione iniziale & avvio infrastruttura [x]

- [x] Mappare PostgreSQL sulla porta host `5433:5432` in `docker-compose.yml`
- [x] Aggiornare `DATABASE_URL` su porta 5433 (`backend/.env`, `backend/.env.example`)
- [x] Avviare PostgreSQL + Redis (`docker compose up -d`) — entrambi `healthy`
- [x] Applicare lo schema al database (`npx prisma migrate dev --name init` → migration `20261004122309_init`)
- [x] Verifica readiness `/api/health/ready` → `200` (`database: up`, `redis: up`)

### Task 1.5 — Seed del database [x]

- [x] Script `backend/prisma/seed.ts` con 5 post di esempio (titolo, contenuto, data)
- [x] Configurato in `prisma7.config.ts` (`migrations.seed`) + script `npm run prisma:seed`
- [x] Eseguito `npx prisma db seed` → 5 post inseriti (operazione idempotente)

### Task 1.6 — Rate limiting & sessioni Redis [ ]

- [ ] Rate limiting distribuito
- [ ] Gestione sessioni / token

---

## Milestone 2 — Proxy Radio & Caching Redis

### Task 2.1 — Rotta & Validazione `GET /api/radios` [x]

- [x] Controller `GET /api/radios` con query string `q` (opzionale), `limit` (default 20, max 50), `page` (default 1)
- [x] Validazione dei parametri di input con **Zod** (→ `400` se invalidi)

### Task 2.2 — Proxy Radio esterno & Gestione errori [x]

- [x] Client verso la sorgente radio esterna (endpoint e chiave via variabili d'ambiente `RADIO_API_*`)
- [x] Timeout di 5s sulle richieste esterne (`AbortSignal.timeout`)
- [x] Gestione errori di rete → `502 Bad Gateway` / `504 Gateway Timeout`

### Task 2.3 — Layer di Caching Redis [x]

- [x] Chiave di cache per query (`radios:search:q=...&limit=...&page=...`)
- [x] Cache HIT → payload da Redis + header `X-Cache: HIT`
- [x] Cache MISS → chiamata esterna, salvataggio su Redis (TTL 600s) + header `X-Cache: MISS`

### Task 2.4 — Preferiti utente [x]

- [x] Aggiunta/rimozione stazioni preferite — `useFavorite` + `toggleFavorite`: localStorage immediato e sync al backend per gli utenti loggati (`GET|POST|DELETE /api/favorites`)
- [x] Lista preferiti per utente — sezione dedicata `FavoritesSection` (`#preferiti`, Task 4.11) alimentata dagli oggetti persistiti

### Task 2.5 — Modulo stazioni radio (persistenza/CRUD) [ ]

- [ ] CRUD stazioni radio
- [ ] Ricerca e filtri (genere, paese, lingua)

---

## Milestone 3 — Notizie, Autenticazione JWT & AI Mock

### Task 3.1 — Notizie (News) [x]

- [x] Endpoint `GET /api/posts` per elencare i post registrati nel DB

### Task 3.2 — Autenticazione JWT [x]

- [x] Installare `bcryptjs` (types inclusi) + `jsonwebtoken` (+ `@types/jsonwebtoken`)
- [x] Variabile `JWT_SECRET` (+ `JWT_EXPIRES_IN`) in `.env` / `.env.example`
- [x] `POST /api/auth/register` (email unica, password hashata con bcrypt)
- [x] `POST /api/auth/login` (verifica password + emissione token JWT)
- [x] Middleware `authenticateJWT` per proteggere le rotte private

### Task 3.3 — Gestione Preferiti [x]

- [x] `GET /api/favorites` (protetta) — lista dei preferiti dell'utente autenticato
- [x] `POST /api/favorites` (protetta) — aggiunge un `radioId`
- [x] `DELETE /api/favorites/:radioId` (protetta) — rimuove un preferito
- [x] Persistenza su DB via Prisma legata all'`userId` estratto dal token

### Task 3.4 — AI Summary Mock [x]

- [x] `SummaryService` con interfaccia astratta `AiSummaryProvider`
- [x] Implementazione `MockAiSummaryProvider` (riassunto di prova)
- [x] `POST /api/posts/:id/summary` — genera/legge il riassunto salvandolo in `Post.summary`

---

## Milestone 4 — Frontend React & Interfaccia Utente

### Task 4.1 — Inizializzazione Frontend [x]

- [x] Progetto **Vite 8 + React 19 + TypeScript strict + Tailwind CSS v4** in `frontend/`
- [x] Dipendenze: `@reduxjs/toolkit`, `react-redux`, `lucide-react`, `axios`, `hls.js`
- [x] Tailwind configurato con `@tailwindcss/vite` e stili base importati

### Task 4.2 — Barra di ricerca & griglia radio [x]

- [x] Input di ricerca con **debounce** (450 ms) e griglia di card radio
- [x] Gestione degli stati `loading` / `empty` / `error`
- [x] Badge `X-Cache: HIT|MISS` letto dall'header della risposta API
- [x] Card radio attivabili cliccando l'intero riquadro (`onClick` sull'`<article>` + `cursor-pointer`); il pulsante play usa `stopPropagation` per evitare il doppio toggle

### Task 4.3 — Player audio persistente [x]

- [x] Player fisso in basso allo schermo: play/pausa, volume, nome radio corrente
- [x] Streaming audio **HLS** (`.m3u8`) gestito con `hls.js`
- [x] Pulsante `X` sulla barra (a destra del tasto "apri a schermo intero") per chiudere **completamente** il player (reducer `clearPlayer`: ferma lo stream e azzera `current`/`isPlaying`/`expanded`); nella modale resta **solo** `ChevronDown` per minimizzare senza interrompere la riproduzione

### Task 4.4 — Area utente (Login / Registrazione) [x]

- [x] Modale di autenticazione con switch login/registrazione
- [x] Token JWT salvato in `localStorage` + Redux (`authSlice`), logout incluso

### Task 4.5 — Sezione Notizie con riassunto AI [x]

- [x] Griglia degli articoli da `GET /api/posts`
- [x] Pulsante "Riassumi con AI" → `POST /api/posts/:id/summary` con visualizzazione del riassunto

### Task 4.6 — Rifinitura UI/UX Player Audio (modale full-screen) [x]

- [x] Barra del player cliccabile che apre l'overlay (play/pausa e volume esclusi via `stopPropagation`)
- [x] Overlay a schermo intero con animazione entrata/uscita, sfondo sfumato dalla copertina (`backdrop-blur-2xl`), scroll lock e chiusura con `Esc`
- [x] Copertina gigante con fallback logo (`rounded-3xl` + `shadow-2xl`), titolo, paese, bitrate e badge del genere
- [x] Indicatore di riproduzione animato (equalizzatore) attivo solo quando l'audio è in play
- [x] Controlli estesi: play/pausa grande, slider volume con icona mute, pulsante `X` e freccia in basso per ridurre a icona
- [x] Fix layout overlay: container `h-dvh max-h-dvh overflow-hidden flex flex-col justify-between p-6`, copertina `max-h-[30vh]` + `rounded-2xl shadow-2xl`, titolo `line-clamp-2` → header, info radio e controlli visibili senza scrollbar
- [x] Chiusura unica in alto a sinistra con icona `ChevronDown` (rimosso il pulsante freccia sotto Play/Pausa)
- [x] Carosello radio prec/succ **lineare** da `radiosSlice` (nessun wrap/modulo): alla prima stazione la freccia `<` diventa `disabled` e manca l'anteprima sinistra, all'ultima lo stesso per `>`; slot vuoto di riserva (`span h-28 w-28`) che tiene la copertina centrata, pulsanti `ChevronLeft`/`ChevronRight` e anteprime sbiadite da `md:` in su → click `playStation`
- [x] Zona centrale scrollabile (`overflow-y-auto min-h-0 flex-1 my-auto`) così volume e play restano fissi su finestre basse
- [x] Spaziatura dinamica delle frecce prec/succ: riga `max-w-md sm:max-w-lg md:max-w-2xl mx-auto justify-between px-2 sm:px-4` con `gap-3` minimo — le frecce scivolano verso l'esterno man mano che la finestra si allarga
- [x] Verifica: `npx tsc --noEmit` (0 errori) e `npm run build` (exit 0)

### Task 4.7 — Migliorie visive Player Audio [x]

- [x] Colori ambientali dinamici: `fast-average-color@9.6.0` + hook `src/hooks/useAmbientColor.ts` estraggono il tono dominante della copertina (`algorithm: 'dominant'`) e lo applicano in sfumatura sull'overlay, con normalizzazione del tono e **fallback neutro `null`** (gradiente scuro) se il canvas è bloccato da CORS
- [x] Equalizzatore a 4 barrette verdi nel mini-player accanto al titolo: componente condiviso `src/components/Equalizer.tsx` (usato anche dalla modale), animato **solo** in stato `playing` e attenuato in pausa
- [x] Animazioni gestite in `index.css` (`.eq-bar`, nuova `.eq-bar-mini` a 650ms) entrambe disattivate da `@media (prefers-reduced-motion: reduce)`
- [x] Verifica: `npx tsc --noEmit` (0 errori) e `npm run build` (exit 0)

### Task 4.8 — Fix bug visivi del Full Player [x]

- [x] Copertina a dimensioni fisse e identici per ogni stazione (`w-60 h-60 sm:w-64 sm:h-64 aspect-square`) con `w-full h-full object-cover rounded-2xl` su `<img>` e fallback → il formato dell'immagine originale non sposta più il layout
- [x] Rimossa la `<img>` sfocata in `absolute` dietro la copertina (l'elemento fantasma che sbucava a sinistra) e di conseguenza il `backdrop-blur-2xl` che la sfocava
- [x] Sfondo neutro `from-slate-900 to-zinc-950` + `transition-colors duration-200 ease-out`, con tint azzerato **sincronamente** al cambio stazione (nessun residuo verde) e `null` su errore/CORS
- [x] `key={current.id}` sull'immagine per forzare il re-render pulito al cambio stazione
- [x] Verifica: `npx tsc --noEmit` (0 errori) e `npm run build` (exit 0)

### Task 4.9 — UX globale: skeleton + toast [x]

- [x] Skeleton loaders: `RadioSkeleton.tsx` (con `animate-pulse`, struttura uguale alla card inclusi i due tasti) e 9 card nella griglia durante il caricamento invece dello spinner
- [x] Toast eleganti: `Toast.tsx` (`ToastProvider` in `App.tsx`, basso-destra, max 3, 4.5s, `prefers-reduced-motion`) collegati a: copia link (`Share2` sulla card), errori di stream nel `Player`
- [x] Nota: i preferiti UI non esistono ancora (Task 2.4 `[ ]`), quindi il toast "preferiti" arriverà con quella task
- [x] Verifica: `npx tsc --noEmit` (0 errori) e `npm run build` (exit 0)

### Task 4.10 — Riproduzione robusta e indicatore di stato (F2) [x]

> F2, terzo bullet: "Indicatore di stato: 'live', buffering, errore di riproduzione" — mancava del tutto (nessuno stato né listener sui media). Sostituisce anche il vecchio comportamento che mostrava il toast "il flusso audio non risponde" a *qualsiasi* rifiuto di `play()`, incluso l'`AbortError` benigno di un caricamento superato: da qui gli errori intermittenti "a volte non parte, riprovo e parte".

- [x] Tipo `PlaybackStatus` (`idle` | `buffering` | `live` | `error`) in `types.ts`; `playbackStatus` + `attempt` nello state di `playerSlice`, con i reducer `playbackFailed`, `setPlaybackStatus`, `retryPlayback`
- [x] `PlaybackStatusBadge.tsx`: badge condiviso (ambra "Connessione…", verde "LIVE" pulsante, rosso "Errore di riproduzione" + pulsante "Riprova"), con `role="status"` e `aria-live="polite"` (F5)
- [x] `Player.tsx`: stati guidati dagli eventi **reali** del media element (`playing` → live, `waiting`/`stalled` → buffering, `error` → errore) più l'errore fatale di hls.js
- [x] `AbortError` ignorato (una `play()` superata non è un guasto) + **un retry automatico** dopo 1,2 s (ricarica la sorgente e riprova) + timeout di connessione a 12 s prima di dichiarare l'errore
- [x] Badge nel mini-player (riga dei metadati) e nel FullPlayer (sotto il titolo), entrambi con "Riprova" che forza un nuovo tentativo
- [x] Rilevamento HLS corretto: `/\.m3u8(\?|#|$)/i` (prima `url.includes('.m3u8')`, sensibile a maiuscole e query string)
- [x] Verifica: `npx tsc --noEmit` (0 errori), `npm run build` (exit 0), container frontend ricostruito e servito da nginx

### Task 4.11 — Sezione Preferiti dedicata e "Ascoltate di recente" (F4) [x]

> La vista preferiti era una **pill che filtrava i risultati correnti**: un preferito fuori dagli ultimi 50 risultati (o fuori dalla ricerca attiva) spariva dalla vista pur restando salvato in localStorage/backend. F4 chiede invece una vista dedicata.

- [x] Nuovo `FavoritesSection.tsx` (`id="preferiti"`): griglia **completa** dei preferiti letta da `favoriteStations` (oggetti interi persistiti), con play, rimozione dal cuore, contatore e stato vuoto esplicativo
- [x] Pulsante "Preferiti" nell'header che scorre alla sezione (stesso pattern di "Notizie")
- [x] **Cuore su ogni card della griglia** (`RadioCard`): prima si poteva aggiungere ai preferiti **solo la stazione in ascolto** dal full player (per salvare una radio bisognava prima avviarla)
- [x] Rimossa la pill "❤️ Preferiti" e la sua logica incompleta da `GenrePills`/`RadioGrid` (una sola fonte per i preferiti)
- [x] Montato `RecentStations.tsx` ("Ascoltate di recente", ultime 10 con "Svuota"): componente già scritto ma mai renderizzato
- [x] Verifica: `npx tsc --noEmit` (0 errori) e `npm run build` (exit 0)

### Task 4.12 — Fix "Info AI" (qualità e velocità) e icona "i" [x]

> La bio era lenta (~5,5 s) e **troncata a metà frase** (es. `"ed eleganti melodie radiofoniche. Pensata"`, 41 caratteri): è lo stesso bug del *thinking* già risolto nei riassunti, ma rimasto in `aiService`. Il pulsante usava ✨ invece di una "i" di informazione.

- [x] `aiService` (Gemini): `thinkingConfig.thinkingBudget = 0` (i token di ragionamento consumavano il budget di output e rallentavano la chiamata), `maxOutputTokens` 300 → 600, timeout 15 s → **10 s**
- [x] Modello esplicito `gemini-2.5-flash` (l'alias `gemini-flash-latest` rispondeva `503 high demand`) + **retry singolo** su `429`/`503`
- [x] Icona del pulsante Info AI e dell'intestazione del drawer: `Sparkles` → **`Info`** (la "i"), in `RadioCard`, `FullPlayer` e `RadioInfoDrawer`
- [x] Card dei preferiti ora **identiche** a quelle della griglia: la sezione riusa `RadioCard` (play/pausa, cuore, copia link, Info AI) invece di card dedicate
- [x] Verifica live sulla stessa stazione USA: **prima 5556 ms / 41 caratteri troncati → dopo 1570 ms / 407 caratteri** di bio completa

### Task 4.13 — Pill dei generi scorrevoli col mouse e header riordinato [x]

- [x] Frecce ‹ › visibili solo quando la striscia può scorrere + **rotellina del mouse** che scorre la riga in orizzontale (listener nativo `{ passive: false }`, con rilascio ai bordi: la pagina continua a scorrere normalmente)
- [x] Header riordinato: **Preferiti · Notizie · account · Esci** (l'area utente ora è l'ultima, dopo le tab di navigazione)
- [x] Verifica: `npx tsc --noEmit` (0 errori), `npm run build` (exit 0), container ricostruiti

---

## Milestone 5 — Docker Unico, Test e Consegna

### Task 5.1 — Stack Docker unico [x]

- [x] `backend/Dockerfile` multi-stage (build con `prisma generate` + `tsc` → runtime)
- [x] `frontend/Dockerfile` multi-stage (build Vite → nginx) con `nginx.conf` e proxy `/api`
- [x] `docker-compose.yml` con 4 servizi: `docker compose up --build` avvia tutto
- [x] `prisma migrate deploy` eseguito automaticamente all'avvio del container backend

### Task 5.2 — Test di integrazione [x]

- [x] Vitest + Supertest: `/api/health`, validazione di `/api/radios`, protezione di `/api/favorites`
- [x] Script `npm test` / `npm run test:watch` (5 test verdi)

### Task 5.3 — Logging strutturato & healthcheck [x]

- [x] Logger strutturato (`src/utils/logger.ts`) con livelli, JSON in produzione
- [x] Sostituiti tutti gli usi di `console.*` nel backend
- [x] Healthcheck attivi su postgres, redis, backend e frontend

### Task 5.4 — Documentazione [x]

- [x] `README.md` aggiornato con architettura finale e stack Docker
- [x] Creato `AI_USAGE.md` sull'uso dell'IA nello sviluppo

### Task 5.5 — CI/CD [x]

- [x] Pipeline automatica di build e test — `.github/workflows/ci.yml` (typecheck · test · build su push/PR)

---

## Milestone 6 — AI Articoli & News

### Task 6.1 — Integrazione modulo AI Articles / News [x]

- [x] **Backend**:
  - [x] Servizio AI src/services/aiService.ts con fallback sicuro (mock) se chiave non configurata
  - [x] Rotta GET /api/articles — lista articoli salvati in DB/Cache
  - [x] Rotta POST /api/ai/radio-info — genera bio/curiosità per una radio (ID+name)
  - [x] Fallback sicuro: richieste non falliscono se API Key o provider non disponibili
- [x] **Frontend**:
  - [x] Tab “Articoli & News” nella navigazione Header.tsx (icona Newspaper)
  - [x] Sezione ArticlesSection.tsx con layout a schede eleganti per articoli
  - [x] Pulsante “Info AI” con icona Sparkles in FullPlayer.tsx e RadioCard.tsx
  - [x] Modale/cassetto laterale con bio generata e animazione di caricamento
  - [x] Nuovi tipi: Article, RadioInfoResponse in 	ypes.ts
  - [x] Thunk etchRadioInfo nel postsSlice.ts per la generazione della bio
  - [x] Aggiornamento store: postsReducer espone  rticles, 
adioInfo, 
adioInfoLoading
- [x] **Verifica**: 
px tsc --noEmit (0 errori) e 
pm run build (exit 0)

### Task 6.2 — Pulizia: rimozione sistema "Articoli" duplicato [x]

> Motivazione: la traccia 22HBG prevede UN solo flusso notizie (`/api/posts` dal feed). Il sistema parallelo `Article` non era richiesto, aveva tabella sempre vuota e componente non montato (dead code).

- [x] Rimossi `backend/src/routes/articles.ts` e mount in `app.ts` (rotta `GET /api/articles`)
- [x] Rimosso modello `Article` da `schema.prisma` + migrazione `20261008114715_remove_article_model` (DROP TABLE)
- [x] Rimossi `ArticlesSection.tsx`, thunk `fetchArticles`, stati `articles`/`articlesStatus`/`articlesError`/`regeneratingId` e tipi `Article`/`ArticlesResponse`
- [x] Rimosso dispatch inutile `fetchArticles` da `App.tsx`
- [x] Bottone Header rinominato "Notizie": scorre alla sezione `#notizie` (prima apriva erroneamente la modale Auth)
- [x] Etichetta pulsante riassunto: "Rigenera riassunto" → "Riassunto AI" (comportamento B3: restituisce il summary esistente senza re-chiamate LLM)
- [x] Verifica: `npx tsc --noEmit` (0 errori) e `npm run build` (exit 0)

### Task 6.3 — Ingestione del feed notizie, sync manuale e cache (B2/B3) [x]

> Requisito B2: job periodico che legge il feed e salva i post in `Post` senza duplicati, `GET /api/posts?title=<testo>&items=<n>` e `POST /api/sync`. Requisito B3: cache Redis dei post invalidata a ogni sincronizzazione riuscita.

- [x] Config: `NEWS_FEED_URL`, `NEWS_SYNC_INTERVAL_SECONDS` (default 300 s, come l'esempio della traccia), `SYNC_API_KEY` in `config/env.ts`, `.env.example` (root + backend) e `docker-compose.yml`
- [x] `src/services/newsSyncService.ts`: download del feed (timeout 15 s) → `mapFeedItem` (`id` → `externalId`, HTML → testo, entità decodificate, `date_gmt` → `publishedAt`) → upsert su `externalId` (nessun duplicato; `summary` esistente mai sovrascritto)
- [x] Errori gestiti: HTTP non-2xx o payload non valido → errore loggato; guardia `syncInFlight` contro sync concorrenti; `runNewsSyncSafely()` per il job (mai crash del processo)
- [x] `POST /api/sync` (header `X-Sync-Key`, confronto constant-time): `401` chiave errata, `503` chiave non configurata (fail-closed), `409` sync già in corso, `200` con `{ fetched, created, updated, skipped }`
- [x] Job periodico in `index.ts` (una sync anche all'avvio) con `setInterval` + `unref()` e `clearInterval()` nello shutdown
- [x] `src/services/postsCache.ts`: read-through cache Redis della lista post (chiave `posts:list`, TTL 600 s) + `invalidatePostsCache()` dopo ogni sync riuscita
- [x] Filtri B2 su `GET /api/posts`: `title` (parziale, case-insensitive) e `items` (1-100, alias `limit`); le query filtrate non usano la cache
- [x] Seed mantenuto come dati iniziali/fallback (`externalId` diversi da quelli del feed → coesistono)
- [x] Verifica live: `News sync completed {"fetched":10,"created":10,"skipped":0}` su dati reali; `/api/posts` → `200`; seconda sync → `created:0, updated:10` (nessun duplicato); cache `posts:list` cancellata e ripopolata al `GET` successivo

### Task 6.4 — Test automatici e documentazione B2/B3 (D4) [x]

- [x] `vitest.config.ts`: `SYNC_API_KEY` di test iniettata prima del caricamento di `env.ts` + `fileParallelism: false` (i test condividono tabella `Post` e chiave Redis `posts:list`)
- [x] `tests/newsSync.test.ts` (unit): normalizzazione id/titolo/contenuto/data, entità HTML, casi scartati (id assente o non numerico, titolo vuoto, `status` ≠ publish)
- [x] `tests/sync.test.ts` (integrazione, `fetch` stubbata): `401` senza/con chiave errata, `200` con conteggi, deduplica alla seconda sync (`created:0, updated:2`), invalidazione cache Redis, `502` con feed in errore
- [x] `tests/posts.test.ts` (integrazione): `400` su `items` fuori range e `title` troppo lungo, filtro titolo che ignora la cache, `items`/`limit`, read-through cache
- [x] Suite verde: 20 test in 4 file (`npm test`), `npx tsc --noEmit` 0 errori
- [x] README: sezioni "Ingestione delle notizie (B2)", "Strategia di cache (B3)" e "Limiti noti"

### Task 6.5 — Frontend: filtro per titolo e paginazione in Notizie (F3) [x]

> Completata dopo il confronto con la traccia: l'API (`?title=`, `?items=`) esisteva già dalla Task 6.4, mancava del tutto la UI. Due scelte dichiarate: il filtro è **server-side** (cerca su tutta la tabella, non solo sulle righe già scaricate) e il caricamento è una **finestra client-side** sulla lista che Redis ha già in cache, quindi "Mostra altre" non riscarica gli stessi articoli a ogni passo.

- [x] Campo di ricerca per titolo collegato a `GET /api/posts?title=<testo>`
- [x] Paginazione (o scroll infinito) sulla sezione `#notizie`
- [x] `postsSlice`: `fetchPosts` accetta `{ title }` — **senza `title` non parte nessun parametro**, quindi la richiesta resta esattamente quella che Redis mette in cache (B3) — nuovo stato `titleFilter` + `visible`, reducer `showMore` e reset a prima pagina quando il filtro cambia (la lista si svuota, così si vede lo skeleton e non risultati che non corrispondono più)
- [x] `NewsSection.tsx`: input `type="search"` con debounce 350 ms (`useDebounce`) e pulsante ✕ di azzeramento; riga di stato `"N di M notizie · aggiornato alle HH:MM"` dentro un `role="status" aria-live="polite"`; **scroll infinito** con `IntersectionObserver` (`rootMargin: 240px`) **più** il pulsante "Mostra altre notizie" come fallback accessibile da tastiera; stato vuoto dedicato quando è il filtro a non trovare nulla ("Nessuna notizia con “X” nel titolo" + "Azzera il filtro")
- [x] **L'input è visibile in tutti gli stati** (caricamento, errore, vuoto, lista): senza questo un filtro con zero risultati sarebbe stato impossibile da azzerare
- [x] Verifica live sul container `:8080` (Chrome headless + CDP), 16 post nel database: `6 di 16` all'avvio con richiesta `/api/posts` (path in cache) → filtro `zzzqqq` ⇒ `0` articoli + `/api/posts?title=zzzqqq` → ✕ ⇒ di nuovo `6 di 16` → "Mostra altre" ⇒ `12 di 16` **senza nuove richieste** → filtro `Addio` ⇒ `1 di 1` + `/api/posts?title=Addio` → confermano sia il round-trip del filtro sia che la paginazione non rifà richieste
- [x] `npx tsc --noEmit` 0 errori e `npm run build` exit 0

### Task 6.6 — Riassunti AI reali con provider configurabile (A1/A2/A3) [x]

> I riassunti erano generati **sempre** dal provider mock (una troncatura con prefisso `[MOCK SUMMARY]`): `summaryService` era cablato sul mock e il provider reale esisteva solo per "Info AI". Mancava inoltre la rotta `GET` indicata da A1.

- [x] `GeminiSummaryProvider` (`gemini-2.5-flash`) e `OpenAISummaryProvider` (`gpt-4o-mini`) con timeout 15 s, `temperature 0.3` e budget di output limitato (costo stabile)
- [x] **Retry singolo** su errori transitori (`429`/`503`) prima del fallback: i piani gratuiti rispondono *"model is currently experiencing high demand"*; sul modello flash il `thinkingBudget` è azzerato perché i token di ragionamento troncavano il riassunto a poche parole
- [x] `createSummaryProvider()` sceglie il provider da `SUMMARY_PROVIDER` (`auto|gemini|openai|mock`); con `auto`: Gemini → OpenAI → mock. Nome modello sovrascrivibile con `SUMMARY_MODEL`
- [x] Fallback sicuro (A3): provider in errore → warning loggato + provider offline, la richiesta resta `200` e l'app funziona senza chiavi
- [x] Prompt in italiano con delimitatori `<<<ARTICOLO>>>`/`<<<FINE_ARTICOLO>>>`: i delimitatori iniettati nel contenuto vengono rimossi e il testo è dichiarato "dato da riassumere" (anti prompt-injection)
- [x] Troncamento a `SUMMARY_MAX_INPUT_CHARS` (default 6000) su confine di parola
- [x] `GET /api/posts/:id/summary` come da A1, mantenendo il `POST` usato dalla SPA; il primo risultato è salvato in `Post.summary` → nessuna seconda chiamata al modello
- [x] La sync azzera `summary` **solo** se titolo o contenuto cambiano davvero nel feed (niente riassunti di testi vecchi)
- [x] `tests/summary.test.ts`: 17 test (troncamento, prompt/anti-injection, scelta provider, genera-e-riusa, retry su 503, nessun retry su 400, fallback, rotte GET/POST/404)
- [x] Verifica live: `npx tsc --noEmit` 0 errori, **37 test verdi in 5 file**, `GET /api/posts/:id/summary` → `200`
- [x] Verifica con chiave Gemini **reale**: `provider=gemini generated=True`, riassunto di 485 caratteri in italiano (con il modello precedente `gemini-1.5-flash` e l'alias `gemini-flash-latest` la chiamata falliva → 400/503)

### Task 6.7 — Seed onesto e automatico (D1) [x]

> I 5 post di esempio erano **notizie inventate** su RadioHub stesso (gen-mag 2026) mischiate alle notizie reali del feed; inoltre il seed **non partiva da solo** nel container, mentre D1 lo richiede.

- [x] Contenuto finto rimosso dal DB: i 5 post cancellati (`DELETE 5`), restano le 10 notizie reali del feed
- [x] `prisma/seed.ts` riscritto con **un solo** contenuto demo dichiarato ("Contenuto di esempio (seed) — non è una notizia reale"), idempotente via `upsert`
- [x] `Dockerfile`: al boot `migrate deploy` → `prisma db seed` (non bloccante se fallisce) → API: con `docker compose up` i dati iniziali partono in automatico
- [x] Riassunti mock già salvati azzerati (verranno rigenerati dal provider configurato)
- [x] Verifica live: log del container `Seed completato {"posts":1}` → `The seed command has been executed` → sync `fetched:10, created:0, updated:10`; `GET /api/posts` → 11 post (10 reali + 1 demo)

### Task 6.8 — Dati per utente: preferiti, recenti e riassunti (B4/F4) [x]

> `syncFavorites` era **scritta ma mai chiamata**: al login non succedeva nulla e al logout nemmeno (nessun dato toccato). Inoltre riassunti e cronologia erano condivisi/dispositivo. Obiettivo concordato: ogni utente ha i **suoi** dati, senza distruggere nulla e senza servizi esterni aggiuntivi.

- [x] Modelli Prisma `RecentPlay` (`@@unique([userId, radioId])`, `playedAt`) e `PostSummary` (`@@unique([postId, userId])`) + migration `add_recent_plays_and_post_summaries`; `User`/`Post` collegati con cascade
- [x] `GET /api/radios/by-ids?ids=a,b` (1-50 id): risolve le stazioni salvate su un altro dispositivo riusando il proxy e la **cache Redis** esistenti (`buildIdsCacheKey`), con 400/502/504 e salto degli elementi malformati
- [x] `routes/recents.ts`: `GET|POST|DELETE /api/recents` protette da JWT, `upsert` a ogni ascolto, tetto di 10 per utente
- [x] `authenticateJWTOptional` + `summaryService.summarize(postId, userId?)`: riga **per utente** per chi è loggato, `Post.summary` come cache pubblica per gli ospiti; `scope: 'user' | 'shared'` nella risposta; la sync cancella le righe per-utente solo se il feed riscrive l'articolo
- [x] Frontend: `syncFavorites` collegata al login (e a ogni reload con token) con **unione** locale+account e risoluzione degli id sconosciuti; `fetchServerRecents`, `pushRecentPlay` (a ogni cambio stazione), `clearFavorites`, `clearServerRecents`
- [x] Logout **non distruttivo**: etichetta *"Sincronizzati con l'account"* / *"Su questo dispositivo"* + pulsante esplicito **"Svuota preferiti"** con conferma a due passaggi
- [x] Notizie: riassunti **chiusi di default** — `Riassumi con AI` (genera e apre) → `Mostra riassunto` / `Nascondi riassunto`; cache locale `radiohub:summaries:v1` per gli ospiti
- [x] Test: 49 verdi in 7 file (nuovi `tests/recents.test.ts`, `tests/radiosByIds.test.ts` e 3 test di isolamento per-utente in `tests/summary.test.ts`)
- [x] Smoke test live: A → `preferiti=2 recents=1 riassunto scope=user generated=True provider=gemini`; B → `preferiti=0 recents=0` con **proprio** riassunto; ospite → `scope=shared generated=False`; `by-ids` → 2 richiesti / 2 risolti


### Task 6.9 — Libreria per identità e riassunti per-utente nella lista [x]

> Dopo la Task 6.8 il cambio utente **non si vedeva**: `syncFavorites` faceva l'**unione** (server ∪ locale) e le chiavi localStorage erano uniche per dispositivo, quindi la lista restava identica per qualunque utente (e anche da ospite). Inoltre `GET /api/posts` restituiva sempre `Post.summary` (cache condivisa), quindi i riassunti per-utente non comparivano nella lista.

- [x] `libraryOwner` nello state + reducer `switchLibraryOwner`: una **libreria per identità** (`radiohub:favorites:v1` per l'ospite, `…:u:<userId>` per ogni account) — persiste lo slot corrente e carica il target
- [x] `adoptGuestLibrary`: al **primo login** i dati dell'ospite vengono spinti sul server e lo slot ospite svuotato → un altro account non eredita nulla (niente distrutto: i dati sono passati all'account)
- [x] Logout → ritorno allo slot ospite: la lista cambia davvero; con `fetchServerRecents` la cronologia dell'account si ricarica al login
- [x] `GET /api/posts` con token → `select: { …, summaries: { where: { userId } } }` e `summary` = **riga dell'utente**; per gli utenti la **cache Redis è disattivata** (altrimenti i riassunti di uno finirebbero nella risposta di un altro)
- [x] Test: 7 file verdi, incluso *"la lista /api/posts mostra il riassunto dell'utente, non quello condiviso"*
- [x] Smoke test live: lista ospite **485 caratteri** vs lista utente **459 caratteri** (diversi), `scope=user generated=True provider=gemini`


### Task 6.10 — Riassunti ibridi: una generazione per articolo, adozione per utente [x]

> Con la Task 6.9 ogni utente generava il **proprio** riassunto: due utenti sullo stesso articolo = **due chiamate LLM per lo stesso testo** (verificato: entrambi `generated=true`). Il PDF chiede che *"il primo risultato generato venga salvato, così le richieste successive non richiamano il modello"* e valuta esplicitamente i **costi**.

- [x] `summaryService.summarize` ora legge in quest'ordine: **1)** riga dell'utente → **2)** cache condivisa (`Post.summary`) → **adottata** nella riga dell'utente con una copia, **senza chiamata al modello** → **3)** nessuna delle due → **una sola generazione**, salvata sia nella riga dell'utente sia nella cache pubblica
- [x] La visibilità resta per-utente (`scope: 'user' | 'shared'` e la lista mostra `summary` solo a chi l'ha chiesto o adottato), quindi la Task 6.9 non viene annullata
- [x] Test aggiornati: *"una sola generazione per articolo: il secondo utente adotta senza chiamare il modello"* (A `generated=true` con 1 chiamata, B `generated=false` con **0** chiamate) e *"la lista è per-utente: nullo per chi non ha mai chiesto, con il testo dopo l'adozione"*
- [x] Suite verde (7 file, 50 test) + `tsc` 0 errori
- [x] Smoke test live: A `generated=True provider=gemini` (353 caratteri) → B `generated=False testo identico` → ospite `generated=False testo identico`


### Task 4.14 — Rifiniture UI: avatar/menu utente e notizie auto-aggiornate [x]

> Il tasto "Aggiorna notizie" restituiva spesso **lo stesso payload** (da ospite la risposta arriva dalla cache Redis, TTL 5 min), quindi sembrava inutile; l'e-mail occupava la barra di navigazione fra due tab.

- [x] **Rimosso** il tasto "Aggiorna notizie": sostituito da **"Aggiornato alle HH:MM"** + **auto-refresh ogni 5 minuti** (stessa cadenza del job di sync), con spinner discreto durante il caricamento
- [x] **Avatar compatto**: cerchio con l'iniziale dell'e-mail (nessun dato nuovo necessario), con `aria-haspopup`/`aria-expanded`, chiusura con click fuori ed `Esc`
- [x] Menu identità: nome utente (parte locale dell'e-mail), e-mail completa, "Installa app" (solo quando il browser la offre), "Esci" — **nessuna voce Preferiti**, perché la tab è già nella barra principale
- [x] Scelta motivata: niente nome/cognome né upload immagine adesso (servirebbero migration, endpoint multipart, storage e dipendenze nuove; F4 non li chiede) — il menu è la sede naturale per aggiungerli in futuro
- [x] Verifica: `npx tsc --noEmit` (0 errori), `npm run build` (exit 0), bundle servito **senza** "Aggiorna notizie" e con "Aggiornato alle" / "Menu utente"


### Task 4.15 — Fix UI: tendina utente sopra la barra e colore ambientale affidabile [x]

> Due difetti segnalati dall'utente: (a) il menu dell'avatar veniva **coperto** dalla barra di ricerca; (b) lo sfondo sfumato del full player seguiva i colori della copertina per alcune stazioni e non per altre.

- [x] **Z-index**: `relative z-40` sull'`<header>`. Causa: `backdrop-blur` crea uno **stacking context**, e senza `z-index` sull'header i fratelli successivi (`<main>`, quindi la barra di ricerca) venivano dipinti sopra la tendina, nonostante il suo `z-50`
- [x] **Nuovo proxy immagini** `GET /api/media?url=…` (backend, `routes/media.ts`): stesso pattern di errori (400/415/413/502/504), `Cache-Control: public, max-age=86400`
- [x] **Guardie SSRF**: solo `http`/`https`, niente credenziali nell'URL, risoluzione DNS e rifiuto di loopback/privati/link-local/multicast (IPv4 e IPv6), redirect seguiti manualmente (max 3) rivalidando ogni meta; limite 2 MB e `content-type` obbligatoriamente `image/*`
- [x] `useAmbientColor` legge l'artwork dal proxy **same-origin** → niente più dipendenza dagli header CORS dell'host; l'`<img>` visibile resta diretto (comportamento invariato)
- [x] **Diagnosi misurata**: su 8 copertine reali, **2 con CORS e 6 senza** (una 404, una 503) → il 75% delle stazioni non poteva colorare lo sfondo; con il proxy quelle raggiungibili funzionano, mentre le immagini inesistenti/che rifiutano restano sul **fallback neutro stabile** (nessun colore casuale)
- [x] Test: 4 casi di guardia in `tests/media.test.ts`; verifica live `proxy backend=200 image/jpeg`, `proxy nginx=200 image/jpeg`, `url privato=400`, `senza url=400`

### Task 2.6 — Miglioramenti UX sugli errori della fonte radio (502) [ ]

> Non è un requisito: B1 chiede la **risposta coerente 502/504** ed è già implementata. Questi sono miglioramenti di esperienza, da fare se avanza tempo.

- [ ] Non rifare la chiamata al server quando la pill **filtra solo in locale** (pop/rock/jazz…): oggi ogni pill rifà `GET /api/radios`
- [ ] Su errore **mantenere la griglia** già caricata + banner "Fonte non raggiungibile — Riprova" invece di sostituirla con il box rosso
- [ ] Loggare il fallimento dell'upstream (oggi un 502 è **silenzioso** nei log) e ritentare una volta su 429/503


### Task 4.16 — Pill dei generi server-backed (fix delle categorie vuote) [x]

> Segnalazione dell'utente: "news" mostrava **1** stazione, "jazz" e "chillout" erano **vuote**. Diagnosi misurata: le pill filtravano *localmente* la lista base di 50 stazioni, che conteneva 1 stazione `news`, **0** `jazz` e **0** `chillout` — mentre il catalogo upstream ha ≥200 stazioni per ciascun genere. Non era un guasto dell'API ma un difetto di progetto.

- [x] `GET /api/radios` accetta ora i filtri nativi della fonte: `tag` (lista di candidati → `tagList`), `countryCode` (`countrycode`), `bitrateMin`, `order`; validazione Zod con `400` sui valori invalidi e i filtri restituiti in `meta.filters`
- [x] **Catena di fallback sui tag** in `radioSource.fetchRadios`: i tag di Radio Browser sono inseriti dagli utenti e incoerenti (`chillout`/`lounge`/`ambient`), quindi vengono provati in ordine finché uno restituisce risultati
- [x] `buildCacheKey` include **ogni** filtro (tags, cc, bitrateMin, order) mantenendo il formato storico per la query di base: senza questo la cache avrebbe servito la lista sbagliata
- [x] Frontend: `PILL_QUERIES` (pill → query server-side) usato da `SearchBar`; rimosso `applyGenreFilter` (niente più doppio filtro locale) e le pill che restituiscono 0 risultati si **nascondono** da sole
- [x] Test: nuovo `tests/radiosFilter.test.ts` (validazione `countryCode`/`bitrateMin`/`order` + 2 test sulla chiave di cache, incluso il formato storico)
- [x] **Verifica live di ogni pill**: Tutti 50 · Top Italia 50 · Rock 50 · Dance 50 · 80s&90s 50 · Jazz 50 · Classica 50 · Chillout 50 · News 50 · HD>128 50 (prima: 7/7/6/4/0/2/0/1/9 su 50). La `Pop` ha risposto `502` una volta (fonte transitoria, come da Task 2.6) e al secondo tentativo 50, poi dalla cache


### Task 4.17 — Prompt di installazione PWA: cattura all'avvio e voce nel menu [x]

> L'utente non trovava "Installa app" nel menu dell'avatar. Due cause reali: (1) l'evento `beforeinstallprompt` può scattare **prima** che React monti e il listener registrato nel componente lo perdeva; (2) la voce era finita **dentro** il menu dell'utente, quindi gli **ospiti** (che non hanno menu) non potevano più installare.

- [x] Nuovo `utils/installPrompt.ts`: cattura dell'evento all'avvio (importato da `main.tsx`, prima del render), `preventDefault()` per non lasciare la mini-infobar di Chromium, subscribe per i componenti che montano dopo
- [x] `appinstalled` → la voce sparisce subito anche se l'installazione è stata fatta dalla UI del browser
- [x] Dopo `prompt()` l'evento è **monouso**: viene scartato comunque (accettato o rifiutato), con toast di conferma se accettato; Chromium ne emette uno nuovo al prossimo caricamento
- [x] Nascosto quando l'app gira già in **standalone** (`display-mode: standalone` o `navigator.standalone` su iOS)
- [x] **Nessun legame con l'account**: è uno stato del dispositivo, quindi login/logout non lo cambiano; gli ospiti hanno l'icona di installazione nella barra (il menu non ce l'hanno)
- [x] Verifica: `npx tsc --noEmit` (0 errori), `npm run build` (exit 0), bundle servito con "Installa app", "Installa RadioHub come app", `appinstalled` e il check `standalone`


### Task 4.18 — Pass accessibilità (F5): contrasto AA, focus visibile, card da tastiera [x]

> F5 chiede contrasto WCAG 2.1 AA, uso completo da tastiera e resa da 360px. Misurazione sul codice: `slate-500` (#64748b) su fondo `slate-900/60` dà **3,7:1**, sotto la soglia AA di 4,5:1 richiesta per il testo.

- [x] **Contrasto**: i testi passano a `slate-400` (≈6,6:1) — data delle notizie (`NewsSection`), riga dei tag a 11px (`RadioCard`), placeholder di `SearchBar` e del timer di spegnimento; anche le icone di controllo (cuore, condividi/info, chiusura toast) a `slate-400` (il limite non-testuale di 3:1 era già rispettato, ma così sono più leggibili)
- [x] Restano a `slate-500/600` solo i glifi **decorativi** (`aria-hidden`, es. fallback del logo) e il testo dei controlli **disabilitati**, esenti dal criterio 1.4.3
- [x] **Focus sempre visibile** (2.4.7): una sola regola `:focus-visible { outline: 2px solid #34d399; outline-offset: 2px }` in `index.css` copre pulsanti, input, link e card attivabili. Sta **fuori dai layer** di Tailwind, quindi per specifica vince anche sulle utility tipo `outline-none` (verificato nel CSS servito: layer `base/components/properties/theme/utilities` + regola non-layerata); rimossa la utility ridondante che era stata messa sull'avatar
- [x] **Card attivabile da tastiera** (2.1.1): `RadioCard` ha `role="button"`, `tabIndex={0}`, `aria-label` dinamico (\"Ascolta X\" / \"Metti in pausa X\") e `onKeyDown` su Invio/Spazio, con la guardia `event.target !== event.currentTarget` per non eseguire due volte l'azione quando il tasto arriva da un controllo interno
- [x] **Skeleton delle notizie**: nuovo `NewsSkeleton.tsx` (4 card con `animate-pulse`) al posto del solo spinner, coerente con `RadioSkeleton` della griglia; il titolo \"Notizie\" è ora uno snippet condiviso presente in **tutti** gli stati, così l'ancora `#notizie` (con `scroll-mt-6`) funziona anche durante caricamento, errore e lista vuota
- [x] Verifica: `npx tsc --noEmit` 0 errori, `npm run build` exit 0, container ricostruito e **tutti healthy**; nel bundle servito risultano `Ascolta `, `Caricamento delle notizie` e la regola `focus-visible`
- [ ] **Da guardare a schermo** (non verificabile da terminale): resa a 360px, spaziature reali e un giro di Tab + Invio/Spazio nel browser

### Task 4.19 — Test: timeout esplicito per i casi che interrogano la fonte live [x]

> Durante la verifica finale la suite backend è risultata **rossa 2 volte su 9 file** (`health.test.ts`, `radiosFilter.test.ts`, entrambi fermati a 5128/5140 ms). Diagnosi: non era una regressione — sono i **due soli test che arrivano davvero all'upstream** (Radio Browser) e con **cache Redis fredda** l'upstream lento supera i 5s di default di vitest. Rilanciando gli stessi due file: 11/11 verdi in 3,3s (risposta dalla cache).

- [x] `LIVE_SOURCE_TIMEOUT_MS = 15_000` applicato **solo** ai due `it` che validano una query valida (`limit=50`, `tag=jazz,blues,soul&countryCode=IT&order=votes`): gli altri test di validazione rispondono `400` prima di uscire in rete e restano sul timeout standard
- [x] Commento nel test che spiega perché il timeout è più alto (rate limit dell'upstream + cache fredda), così non sembra un limite arbitrario
- [x] **Prova del nove a cache fredda**: `redis-cli FLUSHDB` (db 0, usata solo come cache) → i due file passano in 3,38s e in Redis ricompaiono le 2 chiavi `radios:search:…` → il fetch upstream è realmente avvenuto
- [x] Suite completa dopo il fix: **9 file / 60 test passati**, `npx tsc --noEmit` backend 0 errori



### Task 4.20 — Bug reale: il feed notizie arrivava stale dall'edge CDN (B2) [x]

> Segnalazione dell'utente: *"è normale che dalle 2:44 alle 13:17 ci siano le stesse notizie?"*. Non era normale. Il job girava davvero (log ogni 5 minuti) ma riportava sempre `fetched:10, created:0, updated:10`: la sync si alimentava di una **copia vecchia di ~12 ore**.

- [x] **Diagnosi con i dati**: dall'host lo stesso URL rispondeva `x-cache: Miss` con 5 articoli nuovi (id massimo 247409), mentre dal container il backend riceveva `x-cache: Hit from cloudfront`, `age: 42558` (≈11,8 h), `date: 8 Oct 23:35 GMT` e i 10 articoli già presenti (id massimo 247380) → l'edge serviva uno snapshot stantio, quindi `created` restava 0
- [x] **Contromisure testate** (script temporaneo in container, poi rimosso): `cache: 'no-store'` e gli header `Cache-Control: no-cache`/`Pragma` **non cambiano nulla** (sempre `Hit`); solo un **URL diverso** (`?_cb=<timestamp>`) produce `Miss` e restituisce il feed fresco
- [x] Fix: `withCacheBuster(url)` esportato da `newsSyncService.ts` e usato nella `fetch` della sync — l'origine ignora il parametro, l'edge no; il commento nel codice riporta la misura
- [x] Test nuovi in `tests/newsSync.test.ts` (con `fetch`, Prisma e Redis stubbati): URL richiesto con `_cb=`, inserimento degli articoli nuovi (`created: 2` + invalidazione cache), aggiornamento senza duplicati con **scarto del riassunto** quando il testo cambia → **10/10 verdi**
- [x] **Verifica end-to-end**: backend ricostruito → la sync all'avvio ha loggato `"created":5,"updated":5`; `GET /api/posts` restituisce ora **16 post** con il più recente `2026-10-09T07:55:38Z`
- [x] Lezione annotata: una sync "verde" può non importare nulla — l'`Age` di CloudFront va controllato in fase di verifica



### Task 4.21 — Documentazione API: OpenAPI 3.1 + RapiDoc su /api/docs (B5) [x]

> Ultimo requisito obbligatorio di backend mancante. Implementato senza nuove dipendenze npm e **senza CDN**.

- [x] `src/docs/openapi.ts`: documento OpenAPI **3.1 scritto come modulo TypeScript** (non un YAML a parte) → è type-checked, finisce in `dist/` con la build e non richiede copie extra né letture di file a runtime. Contenuto: 15 path, 13 schemi (Radio, Post, Summary, User, Favorite, Recent, SyncResult, ErrorResponse…), 7 risposte riusabili (400/401/404/413/415/502/504), 2 schemi di sicurezza (`bearerAuth`, `syncKey`)
- [x] `src/routes/docs.ts`: `GET /api/openapi.json` (specifica), `GET /api/docs` (pagina RapiDoc), `GET /api/docs/rapidoc-min.js` (bundle dalla **stessa origine**, letto una volta e servito dalla memoria)
- [x] **RapiDoc vendorizzato** in `backend/public/rapidoc-min.js` (843 KB, licenza MIT nell'header) + `COPY public ./public` nel Dockerfile: la pagina funziona **senza internet**, coerente con "parte con `docker compose up` su una macchina con solo Docker"
- [x] **CSP dedicata per la pagina**: RapiDoc renderizza in uno *shadow root* con stili inline e la policy globale di helmet lo bloccherebbe; la policy della sola `/api/docs` usa `useDefaults: false` (nessuna direttiva aggiunta di nascosto), `'unsafe-inline'` solo per gli stili e **niente `upgrade-insecure-requests`**, che romperebbe la pagina su `http://localhost`
- [x] **Bonus B1 trovato mentre documentavo**: la traccia chiama il parametro `query` (`GET /api/radios?query=<testo>`), il codice accettava solo `q` → `query` è ora un **alias** (vince `q` se entrambi presenti) e il valore arriva davvero alla fonte (`meta.query`)
- [x] Test: nuovo `tests/docs.test.ts` (8 casi: documento 3.1, **copertura di ogni endpoint**, `$ref` tutti risolti, `operationId` unici + contesto di sicurezza per ogni operation, pagina RapiDoc, CSP senza `upgrade-insecure-requests`, bundle servito >100 KB) + caso `?query=` in `radiosFilter.test.ts` → **15/15 verdi**, suite completa **10 file / 74 test**
- [x] **Qualità della specifica verificata con uno strumento esterno**: `npx @redocly/cli lint` sul documento servito → **0 errori** (a inizio lavoro erano 9 errori `security-defined` e 19 warning `operationId`, tutti risolti); restano 5 warning accettati e spiegati nel README
- [x] **Bug trovato solo guardando la pagina**: usavo `<rapidoc>`, ma il bundle RapiDoc 9.x registra l'elemento **`<rapi-doc>`** (il vecchio nome non è più definito) → la pagina restava **bianca senza alcun errore** in console. Diagnosi con **Chrome headless + DevTools Protocol** (`rapidocDefined: false`, script servito 200 e non bloccato) e poi estrazione dei `customElements.define()` reali dal bundle; dopo il fix: `hasShadowRoot: true`, **119 KB di UI renderizzata** nello shadow root e screenshot della pagina funzionante
- [x] Test anti-regressione: `docs.test.ts` non confronta più una stringa scritta a mano ma **il tag della pagina con gli elementi definiti dal bundle servito** (aggiunto un caso dedicato) → 9 casi verdi
- [x] Verifica live: `openapi=3.1.0, path=15, schemi=13, risposte=7, security=bearerAuth,syncKey`; bundle `843 KB text/javascript`; pagina 200 con CSP **sia su :4000 sia attraverso nginx su :8080**; `?query=jazz&limit=3` → `meta.query=jazz`, 3 risultati

### Task 4.22 — Fix tema: pillola di genere attiva e cerchio profilo invisibili (X7) [x]

> Segnalazione dell'utente: *"devi fare in modo che il tasto a pillola scelto in alto fra i generi risulti visibile e stessa cosa il cerchio del profilo in alto a destra, sia se è presente tema chiaro che tema scuro"*. Non era un problema di contrasto: gli elementi erano **senza sfondo del tutto**, in entrambi i temi.

- [x] **Diagnosi sul CSS buildato** (non "a occhio"): in `index.css` i token `--color-accent*` erano dichiarati **solo** dentro `.palette-dark`/`.palette-light`, mai dentro `@theme`. In Tailwind 4 una utility esiste solo se la variabile è dichiarata in `@theme`, quindi nel bundle `.bg-accent{` / `.bg-accent-soft` / `.text-accent-text` / `.border-accent-border` **non erano generate** (`IndexOf` → `-1`), mentre `.text-on-accent` sì (`--color-on-accent` era l'unica in `@theme`). Risultato: pillola attiva, avatar e ogni pulsante accent restavano senza sfondo e il testo `on-accent` si fondeva col fondo (verde scurissimo sullo scuro, bianco sul chiaro)
- [x] **Fix** in `frontend/src/index.css`: aggiunti `--color-accent`, `--color-accent-soft`, `--color-accent-text`, `--color-accent-border` dentro il blocco `@theme` (valori = tema scuro come default), con commento che spiega perché devono stare lì. Le ridefinizioni per-tema in `.palette-dark`/`.palette-light` restano e **vincono** perché non-layerate (`theme` layer vs stile non-layerato)
- [x] **Verifica**: `npm run build` (tsc + vite) exit 0; nel nuovo CSS `index-VOj4FOuV.css` compaiono `.bg-accent{background-color:var(--color-accent)}`, `.bg-accent-soft`, `.text-accent-text`, `.border-accent-border` e le varianti `hover:`/`focus:`; `--color-accent` ora è in `:root` e `.palette-light` lo riporta a `#047857` → la pillola attiva e l'avatar sono visibili (verde + testo scuro) in entrambi i temi
- [x] Il fix è **sistemico**: rigenera anche le utility accent usate da `RadioCard`, `SleepTimer`, `SearchBar`, `AuthModal`, `Header` (pulsante "Accedi / Registrati") e `ThemeToggle`


### Task 4.23 — Refresh che non aggiornava la pagina: cache shell + deploy non allineato [x]

> Segnalazione dell'utente: *"non posso più fare refresh della pagina"*. Diagnosi: il container frontend eseguiva un'**immagine del 13:26 UTC**, precedente al fix della Task 4.22 (build locale 14:01 UTC), quindi su `:8080` il fix non era mai stato deployato; in più la shell veniva messa in cache dal service worker (`radiohub-shell-v1`) e nginx non inviava header di cache, per cui un refresh poteva restare sulla copia vecchia.

- [x] **Diagnosi con i dati**: `docker inspect` → immagine `Created=2026-10-09T13:26:45Z` e `Mounts=[]` (nessun bind-mount: il sito è la copia incisa nell'immagine) + `curl http://localhost:8080/` serviva `index-BasNkCJj.css` / `index-D1AiAA3c.js` (build pre-fix). `nginx.conf` senza `Cache-Control`; `public/sw.js` con `CACHE_NAME = 'radiohub-shell-v1'` (nome mai incrementato tra i deploy)
- [x] **Replica del refresh**: Chrome headless con profilo persistente, 2° avvio con il service worker già installato → la pagina renderizza (236 KB). Il SW usa network-first sulle navigazioni, quindi il reload funziona: il problema percepito è la **copia vecchia servita + cache**, non un blocco della navigazione (nessun `beforeunload` nel codice app)
- [x] **Fix cache/deploy** in `frontend/nginx.conf`: `location = /index.html` e `location = /sw.js` con `Cache-Control: no-cache` (l'HTML si rivalida sempre → un nuovo deploy si vede subito al refresh); `location /assets/` con `public, max-age=31536000, immutable` (i nomi sono content-hashed); in `frontend/public/sw.js` la cache passa a `radiohub-shell-v2` (l'`activate` cancella ogni cache con nome diverso)
- [x] **Deploy**: `docker compose up -d --build frontend` → `radiohub-frontend healthy`; `:8080` serve ora il build col fix (`index-VOj4FOuV.css`), `/` e `/sw.js` rispondono `Cache-Control: no-cache`, gli asset `immutable`
- [x] **Verifica live dal container** (Chrome headless + CDP su `:8080`): pillola attiva "Tutti" (`aria-pressed="true"`) e pulsante "Accedi / Registrati" → tema scuro `bg #10b981` / testo `#06281e`, tema chiaro `bg #047857` / testo bianco: **visibili in entrambi i temi**


### Task 4.24 — La pagina /api/docs non scorreva con la rotellina del mouse (B5) [x]

> Segnalazione dell'utente: *"non riesco a scorrere la pagina delle specifiche"*. La mia prima verifica aveva concluso "scorre, è solo lunga": **sbagliata**. Avevo misurato con `window.scrollTo()` — cioè lo scroll **programmatico** — che va da 0 a 17.972 su 18.676 px. La misura giusta è la **rotellina**, simulata con eventi `wheel` reali via DevTools Protocol, e dice l'opposto: `window.scrollY` resta **0** su qualunque punto della pagina.

- [x] **Causa (misurata, non ipotizzata)**: il contenitore interno di RapiDoc `main.main-content` ha `overflow: auto` ma **nessun limite di altezza** (clientH = scrollH = 18.539 px) e il suo genitore `div.body` ha `overflow: hidden`. Per specifica CSS un box con `overflow: hidden` **interrompe la catena dello scroll**: la rotellina viene assorbita e non raggiunge mai il documento. Spiega anche il comportamento "a intermittenza" — `scrollTo`, lo `scrollIntoView` dei link della barra laterale e la barra di scorrimento funzionavano (scroll programmatico), la rotellina no
- [x] **Fix** in `routes/docs.ts`: il documento diventa un layout a piena altezza (`body { height: 100vh; display: flex; flex-direction: column; overflow: hidden }`) e il componente riceve `style="flex: 1 1 auto; min-height: 0"`. Con un'altezza definita RapiDoc crea il proprio **contenitore scrollabile interno**, che è il suo funzionamento previsto
- [x] **Verifica prima/dopo** (stesse condizioni, eventi `wheel` reali su `:8080`): prima → contenuto `0 → 0` (fermo) e barra laterale con `nav.clientH 1224 = scrollH 1224` (menu tutto disteso in un documento che la rotellina non muoveva); dopo → contenuto `0 → 400` (`main.clientH 621 / scrollH 18.539`) e barra laterale `0 → 400` (`nav.clientH 572 / scrollH 1241`: il menu ha il proprio scroll e risponde). La finestra non scorre più: è un layout "app" a 100vh, come previsto da un componente del genere
- [x] **Errore da annotare (mio)**: la prima versione del commento nel codice conteneva dei **backtick dentro un template literal** — la pagina HTML è una stringa delimitata da backtick, quindi i miei `` `flex: 1` `` la chiudevano: `tsc` dava 10 errori, il build Docker falliva e il container restava col codice vecchio (l'errore era nascosto da un `Select-Object -Last 4`). Il commento ora non usa backtick
- [x] Test: `tests/docs.test.ts` **9/9 verdi**; `radiohub-backend` ricostruito e `healthy`; la pagina servita contiene il fix (`style="flex: 1 1 auto; min-height: 0; width: 100%"`)
- [ ] **Limite noto che resta**: la pagina delle specifiche è comunque un documento lungo ~18.500 px renderizzato in uno shadow root da 843 KB di bundle: su macchine lente la rotellina resta poco fluida


### Task 4.25 — B1: FM-World come fonte primaria della ricerca radio, con fallback dichiarato [x]

> La traccia (B1) indica **FM-World** con token Bearer; il codice usava Radio Browser. Proxy, normalizzazione, cache e 502/504 c'erano già, mancava il client. Prima di scriverlo ho **misurato** l'endpoint con il token del documento: `403 Forbidden` (e `401` senza token) — quindi il token è riconosciuto ma non autorizzato. Da lì la scelta: FM-World primario, Radio Browser come fallback, e **fallback dichiarato nella risposta** invece che silenzioso.

- [x] `services/radioSource.ts`: `searchViaFmWorld` (`GET <base>/radios?query=&limit=` + `Authorization: Bearer`, token da `FM_WORLD_API_TOKEN`, timeout e errori mappati sugli stessi errori tipizzati) più un **mapper tollerante** (`pickString`/`pickNumber`/`pickTags`, contenitore o array nudo): la forma della risposta non è osservabile, quindi non si finge di conoscerla
- [x] `fetchRadios` ora restituisce `{ stations, provider, fallback }`: Radio Browser interviene per i filtri che FM-World non espone (`tag`/`countryCode`/`bitrateMin`/`order`/`page > 1`), per token mancante e quando FM-World fallisce; `fetchStationsByIds` resta su Radio Browser (non esiste un endpoint per id)
- [x] `services/radioService.ts`: la **provenienza viene messa in cache** insieme alle stazioni (altrimenti una HIT non saprebbe più chi ha risposto), con lettura retro-compatibile delle voci scritte prima (solo array → Radio Browser) e `readCache<T>` che valida la forma attesa
- [x] `routes/radios.ts`: `meta.source` è la fonte reale e `meta.fallback` dice chi ha risposto al posto di FM-World e perché; aggiunto l'header `X-Radio-Source`
- [x] `config/env.ts` + `.env.example` + `docker-compose.yml`: `FM_WORLD_API_BASE_URL` e `FM_WORLD_API_TOKEN` (token **solo lato server**; senza token il primario non viene nemmeno tentato e l'app parte comunque)
- [x] `docs/openapi.ts` allineato: `meta.source` con enum, `meta.fallback` documentato, esempi 502/504 riferiti a FM-World
- [x] **Test**: nuovo `tests/radioSource.test.ts` (8 casi, `fetch` stubbata, zero rete) — FM-World ok, array nudo con nomi di campo alternativi, fallback su 403 / timeout / payload inatteso / token mancante / filtri, errore propagato se cadono entrambe le fonti → suite **11 file / 83 test verdi**
- [x] **Verifica live** su `:8080` con il token della traccia in `.env` (file ignorato da git): `?query=jazz&limit=3` → `source: radio-browser`, `fallback: {from: fm-world, to: radio-browser, reason: "HTTP 403"}`, 3 stazioni, e alla seconda chiamata `X-Cache: HIT` con `X-Radio-Source: radio-browser` (la provenienza sopravvive alla cache); `?tag=jazz,blues` → `reason: "query needs filters FM-World does not expose"`
- [x] Difetto mio trovato nei log: `errorContext(error)` contiene `message`, che nel logger (`{ message, ...context }`) **sovrascrive** il messaggio della riga → il warn del fallback perdeva il "falling back". Ora il contesto usa la chiave `error`
- [x] Difetto trovato in verifica: `de1.api.radio-browser.info` ha risposto `503` (rate limit) → il client riceve `502` coerente; documentato nel README con l'alternativa `all.api.radio-browser.info` (una variabile d'ambiente)
- [x] README: nuova sezione "Fonte radio (B1)" con strategia e misura; "Limiti noti" riscritti (token non valido, payload non osservabile, filtri, mirror singolo) e rimossa la voce **F3** ormai completata
