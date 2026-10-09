# RadioHub — Task & Stato

Questo file è il **tracker**: dice a che punto siamo in un minuto. Il dettaglio
delle 57 task — diagnosi, misure, prima/dopo e i "perché" delle scelte — sta in
[`TASKS-archive.md`](./TASKS-archive.md).

Legenda: `[x]` fatto · `[~]` parziale · `[ ]` da fare. Le sigle dei requisiti
(`B` backend, `F` frontend, `A` integrazione AI, `D` DevOps, `X` bonus) sono
quelle del documento di consegna.

## 1. Stato rispetto alla traccia 22HBG

### Obbligatori — 16 fatti, 2 parziali

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
| **D3** | ESLint + Prettier, TypeScript strict, commit piccoli | `[~]` | TS strict `[x]` e cronologia `[x]` (13 commit per area); **ESLint e Prettier mancano** |
| **D4** | Test unitari + integrazione backend, **RTL sul frontend** | `[~]` | Backend `[x]` — **83 test in 11 file**; **frontend 0 test** |
| **D5** | Log strutturati, `GET /api/health` con DB e Redis | `[x]` | `utils/logger.ts` (JSON in produzione), `routes/health.ts` |

### Bonus — 2 completi, 1 parziale

| # | Bonus | Stato | Dove sta la prova |
| --- | --- | --- | --- |
| **X1** | Pipeline CI con lint, test e build | `[x]` | `.github/workflows/ci.yml`: typecheck + 83 test + build, con Postgres e Redis reali |
| **X7** | PWA installabile, tema chiaro/scuro, condivisione radio | `[x]` | `manifest.json`, `sw.js`, `utils/{theme,installPrompt}.ts`, copia link in `RadioCard` |
| **X6** | Rate limiting, helmet, CORS, refresh token | `[~]` | `helmet()` e `cors()` attivi; **mancano rate limiting e refresh token** |
| X2 | Deploy su un cloud con URL pubblico | `[ ]` | — |
| X3 | Ricerca in linguaggio naturale | `[ ]` | — |
| X4 | Domande sulle notizie (RAG) con fonti | `[ ]` | — |
| X5 | Aggiornamento in tempo reale (WebSocket o SSE) | `[ ]` | — |
| X8 | E2E con Playwright (cerca → ascolta → preferiti) | `[ ]` | — |

## 2. Cosa manca, in ordine di rapporto valore/sforzo

| # | Cosa | Tipo | Sforzo |
| --- | --- | --- | --- |
| 1 | **D3** — ESLint + Prettier: config, dipendenze, script `lint`, passo in CI | obbligatorio | ~1 h |
| 2 | **D4** — test frontend con React Testing Library su `Player` e `SearchBar` | obbligatorio | 2-4 h |
| 3 | **Consegna** — sezione *Requisiti bonus svolti* nel `README.md` | consegna | 20 min |
| 4 | **X5** — nuovi post in tempo reale (SSE) | bonus | medio |
| 5 | **X6** — rate limiting e refresh token (2 dei 4 pezzi già fatti) | bonus | medio |
| — | X2 / X3 / X4 / X8 | bonus | alti |

### Task interne ancora aperte (non richieste dalla traccia)

- [ ] **1.6** Rate limiting distribuito e gestione sessioni/token
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
- [ ] **1.6** Rate limiting distribuito e gestione sessioni/token

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
