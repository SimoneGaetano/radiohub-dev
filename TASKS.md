# RadioHub — Roadmap & Task List

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

### Task 2.4 — Preferiti utente [ ]

- [ ] Aggiunta/rimozione stazioni preferite
- [ ] Lista preferiti per utente

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

