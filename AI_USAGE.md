# Uso dell'IA (Cline) nello sviluppo di RadioHub

Questo documento descrive come l'intelligenza artificiale — nello specifico
**Cline**, l'agente CLI utilizzato durante lo sviluppo — ha contribuito alla
realizzazione di RadioHub, quali decisioni sono state prese con il suo supporto
e quali limiti restano.

## 1. Ruolo dell'agente

Cline ha operato come *pair programmer* eseguendo attività ripetitive e
meccaniche che uno sviluppatore dedica buona parte del tempo:

| Area | Attività svolte dall'agente |
| ---- | ---------------------------- |
| Scaffolding | Creazione di strutture di cartelle, `package.json`, `tsconfig`, `.gitignore`, `.env.example` |
| Codice applicativo | Rotte Express, slice Redux, componenti React, servizi e middleware |
| Ricerca | Versioning compatibile delle librerie, breaking change di Prisma 7 e bcryptjs 3 |
| Verifica | Esecuzione di `tsc --noEmit`, build Vite, test Vitest, smoke test end-to-end |
| Infrastruttura | Dockerfile multi-stage, `docker-compose.yml`, healthcheck, seed del database |
| Documentazione | `README.md`, `TASKS.md` e questo file |

## 2. Iterazione per milestone

Lo sviluppo è stato suddiviso in milestone, ognuna chiusa con una verifica
eseguita prima di passare alla successiva.

| Milestone | Risultato |
| --------- | --------- |
| **1 — Setup** | Monorepo Node/Express/TS strict, PostgreSQL + Redis via Docker, `docker-compose.yml` |
| **1 — Prisma ORM** | Prisma 7 con generator `prisma-client`, driver adapter `pg`, schema `User`/`Favorite`/`Post`, prima migrazione |
| **2 — Proxy & Cache** | `GET /api/radios` con validazione Zod, timeout 5 s, errori `502`/`504`, cache Redis con header `X-Cache` |
| **3 — Auth & Notizie** | JWT con bcrypt, middleware `authenticateJWT`, preferiti protetti, `SummaryService` con provider IA astratto + implementazione Mock |
| **4 — Frontend** | React 19 + Vite 8 + Tailwind 4, Redux Toolkit, ricerca con debounce, player HLS, modale auth, sezione notizie |
| **5 — Consegna** | Seed del database, stack Docker unico, test di integrazione, logging strutturato |

## 3. Decisioni tecniche assistite dall'IA

Le seguenti scelte sono nate dall'analisi fatta durante lo sviluppo e sono
riportate qui perché **non sono ovvie** e perché chi rileggerà il codice
potrebbe chiedersene il motivo.

- **Prisma 7 richiede un driver adapter.** Il motore Rust è stato rimosso: per
  PostgreSQL serve `@prisma/adapter-pg`. Senza di esso `new PrismaClient()` non
  è sufficiente.
- **La porta 5432 era occupata** sull'host da un altro servizio, perciò
  PostgreSQL è stato esposto su `5433:5432`. Tutte le stringhe di connessione
  (`DATABASE_URL`) sono state allineate di conseguenza.
- **`bcryptjs` v3 espone solo named exports** e `default` è `undefined`: un
  import predefinito causerebbe un errore a runtime. I tipi sono inclusi nel
  pacchetto, quindi `@types/bcryptjs` (stub della v2) è stato rimosso.
- **Tailwind CSS v4** non usa più `tailwind.config.js` né PostCSS: si configura
  con il plugin `@tailwindcss/vite` e la direttiva `@import "tailwindcss"`.
- **`prisma.config.ts` (v7)** sostituisce la sezione `package.json#prisma` e non
  carica più `.env` da solo: è necessario `import "dotenv/config"`.
- **Il middleware JWT è applicato per-rotta** e non con `router.use(...)`,
  perché quest'ultimo si attiverebbe anche su rotte non protette montate sullo
  stesso prefisso `/api`.

## 4. Verifica automatizzata

Ogni milestone è stata chiusa con una verifica reale, non solo con la scrittura
del codice:

- `npm run typecheck` (backend) e `npm run build` (frontend): nessun errore.
- **Test di integrazione** con Vitest + Supertest su `/api/health`, la
  validazione di `/api/radios` e la protezione di `/api/favorites`.
- **Smoke test end-to-end** del backend (registrazione, login, preferiti,
  riassunto AI) eseguito contro un'istanza reale.
- **Verifica dello stack Docker**: `docker compose up --build`, controllo degli
  healthcheck e chiamata agli endpoint attraverso il reverse proxy di nginx.

## 5. Limiti e buone pratiche emersi

- **Gli errori di terminale vanno sempre spiegati prima di essere corretti.**
  Esempi concreti incontrati: il prompt interattivo di `create-vite` che
  blocca le shell non interattive, l'escaping delle virgolette nelle query
  `psql` da PowerShell e l'allineamento delle versioni di Prisma.
- **Le versioni delle dipendenze vanno verificate prima dell'installazione.**
  Il registry npm ha restituito versioni non allineate tra CLI e client
  Prisma, ed è stato necessario fissare esplicitamente la coppia `7.10.0`.
- **Il codice generato va escluso dal controllo stretto** quando possibile: il
  client Prisma generato include `// @ts-nocheck` e non va modificato.
- **Nessuna verifica va data per scontata**: ogni affermazione di funzionamento
  riportata in questo documento corrisponde a un comando realmente eseguito.

## 6. Lavoro ancora manuale

- **Test frontend con React Testing Library (D4)**: assenti. Il passo in CI è
  `npm test --if-present` e si attiverà da solo quando esisterà lo script.
- **Rate limiting sulle API (bonus X6)**: `helmet` e CORS sono attivi, la
  limitazione delle richieste no.
- **Provider IA reale**: integrato (Gemini/OpenAI) e selezionabile con
  `SUMMARY_PROVIDER`, ma il default resta il **mock** per far partire l'app
  anche senza chiavi API.

## 7. Come riprodurre il workflow

1. Definire l'obiettivo della milestone e le relative voci in `TASKS.md`.
2. Far implementare all'agente il codice **per gruppi di file piccoli**,
   verificando con `tsc --noEmit` o `npm run build` dopo ogni gruppo.
3. Eseguire test e smoke test prima di spuntare le task.
4. Aggiornare `TASKS.md` e la documentazione solo a lavoro finito.

---

*Documento generato e mantenuto con il supporto di Cline.*