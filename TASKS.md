# RadioHub — Task & Stato

Questo file è il **tracker**: dice a che punto siamo in un minuto. Il dettaglio
delle 57 task — diagnosi, misure, prima/dopo e i "perché" delle scelte — sta in
[`TASKS-archive.md`](./TASKS-archive.md).

Legenda: `[x]` fatto · `[~]` parziale · `[ ]` da fare. Le sigle dei requisiti
(`B` backend, `F` frontend, `A` integrazione AI, `D` DevOps, `X` bonus) sono
quelle del documento di consegna.

## 1. Stato rispetto alla traccia 22HBG

### Obbligatori — 18 fatti, 0 parziali

| # | Requisito | Stato | Dove sta la prova |
| --- | --- | --- | --- |
| **B1** | Proxy radio verso FM-World, token lato server, validazione, `502`/`504` | `[x]` | `radioSource.ts` (FM-World primario + fallback dichiarato in `meta.fallback`), 8 test, README § *Fonte radio (B1)* |
| **B2** | Job periodico sul feed, `GET /api/posts`, `POST /api/sync` | `[x]` | `newsSyncService.ts`, `routes/{posts,sync}.ts`, 3 file di test |
| **B3** | Cache Redis con TTL e invalidazione a ogni sync | `[x]` | `postsCache.ts`, cache radio in `radioService.ts`, header `X-Cache`, README § *Strategia di cache* |
| **B4** | Registrazione/login con hash + JWT, preferiti | `[x]` | `authService.ts` (bcrypt), `routes/{auth,favorites,recents}.ts` |
| **B5** | OpenAPI consultabile con RapiDoc su `/api/docs` | `[x]` | `docs/openapi.ts`, `routes/docs.ts` (bundle vendorizzato), `tests/docs.test.ts` |
| **F1** | Ricerca con debounce, stati loading/vuoto/errore | `[x]` | `SearchBar.tsx`, `RadioGrid.tsx` |
| **F2** | Player persistente, controlli, stato del flusso, HLS | `[x]` | `Player.tsx`, `FullPlayer.tsx`, `PlaybackStatusBadge.tsx` (hls.js) |
| **F3** | Notizie con filtro per titolo e scroll infinito | `[x]` | `NewsSection.tsx` (`?title=`, `IntersectionObserver`) |
| **F4** | Area utente e preferiti con pagina dedicata | `[x]` | `AuthModal.tsx`, `FavoritesSection.tsx`, `useFavorite.ts` |
| **F5** | Da 360 px, tastiera, etichette, contrasto WCAG 2.1 AA | `[x]` | `index.css` (`:focus-visible`), `RadioCard.tsx`, task 4.18 |
| **A1** | `GET /api/posts/:id/summary` con salvataggio del primo risultato | `[x]` | `routes/posts.ts`, `PostSummary` + `Post.summary` |
| **A2** | Provider astratto con due implementazioni, scelto da env | `[x]` | `summaryService.ts`, `SUMMARY_PROVIDER=auto\|gemini\|openai\|mock` |
| **A3** | Timeout, errori, testi lunghi, difesa da prompt injection | `[x]` | README § *Riassunti AI (A1–A3)* |
| **D1** | `docker compose up` unico, build multi-stage, migrate + seed | `[x]` | `docker-compose.yml`, i due `Dockerfile` |
| **D2** | Tutto da variabili d'ambiente, `.env.example`, mai `.env` | `[x]` | `config/env.ts` (Zod, fail-fast); `.env` è in `.gitignore` |
| **D3** | ESLint + Prettier, TypeScript strict, commit piccoli | `[x]` | config flat in `backend/eslint.config.mjs` e `frontend/eslint.config.mjs` + Prettier alla radice; `lint` e `format:check` in CI; storia in commit per area |
| **D4** | Test unitari + integrazione backend, **RTL sul frontend** | `[x]` | backend **97 test in 13 file**; frontend **13 test** (`tests/SearchBar.test.tsx`, `tests/Player.test.tsx`) con `npm test` in CI |
| **D5** | Log strutturati, `GET /api/health` con DB e Redis | `[x]` | `utils/logger.ts` (JSON in produzione), `routes/health.ts` |

### Bonus — 7 completi, 1 parziale

| # | Bonus | Stato | Dove sta la prova |
| --- | --- | --- | --- |
| **X1** | Pipeline CI con lint, test e build | `[x]` | `.github/workflows/ci.yml`: lint + format:check + typecheck + 97 test + build, con Postgres e Redis reali |
| **X7** | PWA installabile, tema chiaro/scuro, condivisione radio | `[x]` | `manifest.json`, `sw.js`, `utils/{theme,installPrompt}.ts`, copia link in `RadioCard` |
| **X6** | Rate limiting, helmet, CORS, refresh token | `[x]` | `backend/src/middleware/rateLimit.ts` (contatori Redis, 3 quote, `429` + header `RateLimit-*`), rate limiting montato in `app.ts` (health e docs esclusi, `trust proxy`), refresh token monouso in `authService.ts` + `POST /api/auth/refresh`/`logout`, rinnovo trasparente in `frontend/src/services/api.ts`, 13 test |
| X2 | Deploy su un cloud con URL pubblico | `[~]` | Config pronta e provata in locale: `frontend/nginx.conf.template` con `BACKEND_HOST`/`BACKEND_PORT` (envsubst), `TRUST_PROXY` configurabile, `render.yaml`, `DEPLOY.md` con verifiche. **Manca l'URL**: serve un account (~10 min) |
| **X3** | Ricerca in linguaggio naturale | `[x]` | `POST /api/radios/search`: `naturalSearchService.ts` (regole deterministiche: paesi + catene di tag delle pill) + `modelClient.ts` (modello, JSON validato con Zod, passaggio alle regole dichiarato in `fallbackReason`), quota `nl-search`, chip dei filtri in `SearchBar.tsx`; 19 test backend + 4 frontend |
| **X4** | Domande sulle notizie (RAG) con fonti | `[x]` | `POST /api/posts/ask`: retrieval **TF-IDF** deterministico (`newsRagService.ts`) + sintesi del modello con citazioni **filtrate** sulle fonti recuperate, `source: ai \| retrieval` dichiarato; pannello `NewsAskPanel.tsx`; 16 test backend + 4 frontend; verificato dal vivo col modello reale |
| **X5** | Aggiornamento in tempo reale (WebSocket o SSE) | `[x]` | SSE `GET /api/posts/stream` con bus **Redis pub/sub** (`realtime/postEvents.ts`), heartbeat 25 s, `proxy_buffering off` in nginx, hook `usePostStream` in `NewsSection`; 3 test backend + 3 frontend; verificato dal vivo attraverso nginx |
| **X8** | E2E con Playwright (cerca → ascolta → preferiti) | `[x]` | `frontend/e2e/cerca-ascolta-preferiti.spec.ts`: flusso completo sulla **stack reale** (`docker compose`), con catalogo e trasporto audio controllati; `npm run test:e2e` (~5 s, stabile su due esecuzioni); workflow separato `.github/workflows/e2e.yml` |

## 2. Piano dei bonus (deciso il 10/10, consegna 17/10)

Ordine per rapporto valore/rischio: prima i bonus a costo basso e rischio noto,
ultimi i due che possono sfuggire di mano (deploy su servizi esterni, E2E
intrinsecamente instabile). Regola: un bonus o è **fatto + testato + documentato**,
o è **dichiarato non svolto con il motivo** — mai lasciato a metà.

| # | Cosa | Sforzo | Stato |
| --- | --- | --- | --- |
| — | **Consegna** — sezione *Requisiti svolti* nel `README.md` | 20 min | `[x]` |
| 1 | **X6** — rate limiting e refresh token (2 dei 4 pezzi già fatti) | 3-4 h | `[x]` fatto |
| 2 | **X5** — nuovi post in tempo reale (SSE) | 3 h | `[x]` fatto |
| 3 | **X3** — ricerca in linguaggio naturale | 2-3 h | `[x]` fatto |
| 4 | **X2** — deploy con URL pubblico | 3-6 h | `[~]` config pronta, URL da attivare |
| 5 | **X4** — domande sulle notizie (RAG) con fonti | 4 h | `[x]` fatto |
| 6 | **X8** — E2E Playwright (cerca → ascolta → preferiti) | 4 h | `[x]` fatto |

X2 e X8 per ultimi con "revert policy": se non reggono, si dichiarano non svolti e
si passa oltre, senza bruciare ore. Fra un bonus e l'altro va lasciato il tempo
per la preparazione al colloquio (debrief per area: cosa ho cambiato, perché, dove
si interviene).

### Task interne ancora aperte (non richieste dalla traccia)

- [x] **1.6** Rate limiting distribuito e gestione sessioni/token (X6: `middleware/rateLimit.ts` + refresh token su Redis)
- [ ] **2.5** Modulo stazioni radio (persistenza/CRUD)
- [ ] **2.6** Miglioramenti UX sugli errori della fonte radio (`502`): mantenere la griglia già caricata, banner "Riprova", un retry su `429`/`503`, e **loggare il `502`** (oggi silenzioso nei log)

**Scadenza della consegna**: 17/10/2026.

## 3. Cronologia — una riga per task

Il dettaglio (diagnosi, misure, prima/dopo) sta in
[`TASKS-archive.md`](./TASKS-archive.md).

### Milestone 1 — Setup & Infrastruttura

- [x] **1.1** Bootstrap del progetto: monorepo, TypeScript strict, health-check, client Postgres/Redis
- [x] **1.2** Prisma ORM e schema DB (`User`, `Favorite`, `Post`) con la prima migration
- [x] **1.3** Integrazione Redis: client condiviso e graceful shutdown
- [x] **1.4** Migrazione iniziale e avvio infrastruttura (Postgres su host `5433`)
- [x] **1.5** Seed del database, idempotente
- [x] **1.6** Rate limiting distribuito e gestione sessioni/token (chiusa con X6)

### Milestone 2 — Proxy Radio & Caching Redis

- [x] **2.1** Rotta e validazione di `GET /api/radios` (Zod → `400`)
- [x] **2.2** Proxy verso la fonte radio esterna, timeout 5 s → `502`/`504`
- [x] **2.3** Layer di caching Redis con TTL e header `X-Cache`
- [x] **2.4** Preferiti utente: localStorage immediato, sync col backend per chi è loggato
- [ ] **2.5** Modulo stazioni radio (persistenza/CRUD)
- [ ] **2.6** Miglioramenti UX sugli errori della fonte radio (`502`)

### Milestone 3 — Notizie, Autenticazione JWT & AI Mock

- [x] **3.1** Notizie: `GET /api/posts` dal database
- [x] **3.2** Autenticazione JWT: bcrypt, register/login, middleware `authenticateJWT`
- [x] **3.3** Gestione preferiti: rotte protette `GET|POST|DELETE`
- [x] **3.4** AI Summary Mock: provider astratto e tabella `PostSummary`

### Milestone 4 — Frontend React, Player & Notizie

- [x] **4.1** Inizializzazione frontend (Vite + React + TypeScript + Tailwind + Redux Toolkit)
- [x] **4.2** Barra di ricerca con debounce e griglia radio (loading/empty/error)
- [x] **4.3** Player audio persistente in basso
- [x] **4.4** Area utente: login e registrazione
- [x] **4.5** Sezione Notizie con riassunto AI
- [x] **4.6** Rifinitura UI/UX del player: modale a schermo intero
- [x] **4.7** Migliorie visive del player
- [x] **4.8** Fix dei bug visivi del Full Player
- [x] **4.9** UX globale: skeleton di caricamento e toast
- [x] **4.10** Riproduzione robusta e indicatore di stato (F2): gli stati del flusso non esistevano
- [x] **4.11** Sezione Preferiti dedicata e "Ascoltate di recente" (F4)
- [x] **4.12** Fix di "Info AI": la bio era troncata a metà frase per il budget di *thinking*
- [x] **4.13** Pill dei generi scorrevoli col mouse e header riordinato
- [x] **4.14** Rifiniture UI: avatar/menu utente e notizie che si aggiornano da sole
- [x] **4.15** Fix UI: tendina utente sopra la barra di ricerca e colore ambientale affidabile
- [x] **4.16** Pill dei generi server-backed: "jazz" e "chillout" erano vuote perché filtravano localmente
- [x] **4.17** Prompt di installazione PWA: cattura all'avvio e voce nel menu
- [x] **4.18** Pass di accessibilità (F5): contrasto AA, focus visibile, card da tastiera
- [x] **4.19** Test: timeout esplicito per i casi che interrogano la fonte live
- [x] **4.20** Bug reale: il feed notizie arrivava *stale* dall'edge CDN (B2)
- [x] **4.21** Documentazione API: OpenAPI 3.1 + RapiDoc su `/api/docs` (B5)
- [x] **4.22** Fix del tema: pillola attiva e cerchio profilo invisibili (X7)
- [x] **4.23** Refresh che non aggiornava la pagina: cache della shell e deploy non allineato
- [x] **4.24** La pagina `/api/docs` non rispondeva alla rotellina del mouse (B5)
- [x] **4.25** B1: FM-World come fonte primaria della ricerca radio, con fallback dichiarato
- [x] **4.26** Qualità del codice: ESLint 10 + Prettier su backend e frontend (D3)
- [x] **4.27** Test dei componenti frontend con React Testing Library (D4)

### Milestone 5 — Docker unico, Test & Consegna

- [x] **5.1** Stack Docker unico: build multi-stage, migrate e seed automatici
- [x] **5.2** Test di integrazione (Vitest + Supertest)
- [x] **5.3** Logging strutturato e healthcheck
- [x] **5.4** Documentazione: `README.md` e `AI_USAGE.md`
- [x] **5.5** CI/CD con GitHub Actions

### Milestone 6 — Consolidamento & requisiti della traccia

- [x] **6.1** Integrazione del modulo AI Articles/News
- [x] **6.2** Pulizia: rimosso il sistema "Articoli" duplicato
- [x] **6.3** Ingestione del feed, sync manuale e cache (B2/B3)
- [x] **6.4** Test automatici e documentazione per B2/B3 (D4)
- [x] **6.5** Frontend: filtro per titolo e scroll infinito in Notizie (F3)
- [x] **6.6** Riassunti AI reali con provider configurabile (A1/A2/A3)
- [x] **6.7** Seed onesto e automatico (D1)
- [x] **6.8** Dati per utente: preferiti, recenti e riassunti (B4/F4)
- [x] **6.9** Libreria per identità e riassunti per utente nella lista
- [x] **6.10** Riassunti ibridi: una generazione per articolo, adozione per utente
