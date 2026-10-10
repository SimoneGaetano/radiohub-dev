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
- **`trust proxy` è obbligatorio per il rate limiting dietro nginx.** Senza
  `app.set('trust proxy', 1)` `req.ip` sarebbe l'IP del container del frontend
  per **tutti** i client e la quota per IP diventerebbe un'unica quota condivisa.
  Non basta stare dietro un proxy: bisogna dichiarare quanti hop fidarsi, e nginx
  deve accodare `$remote_addr` a `X-Forwarded-For` (lo fa già).
- **Il refresh token è hashato in Redis e monouso.** Salvarlo in chiaro avrebbe
  reso un dump di Redis equivalente a un elenco di sessioni attive; la rotazione
  fa sì che un gettone intercettato valga un solo uso. Un `503` sul rinnovo non
  deve cancellare la sessione: è un guasto nostro, non un gettone invalido.
- **Nei test le quote di rate limiting vanno alzate.** La suite fa centinaia di
  richieste dallo stesso IP: con le quote reali fallirebbe per `429` sui motivi
  sbagliati. Le soglie vere — `429` compreso — sono verificate da un test
  dedicato che costruisce il middleware con i propri valori e uno store iniettato.
- **Un client unico per i modelli.** `modelClient.ts` (X3) esiste perché riassunti
  e interpretazione della ricerca parlano con gli stessi due servizi: duplicare
  timeout, retry e gestione degli errori significa doverli correggere due volte.
  `SUMMARY_PROVIDER`/`SUMMARY_MODEL` restano l'unica configurazione dei modelli.
- **L'output del modello è validato, non creduto.** La risposta dell'LLM passa da
  uno schema Zod e, se non lo rispetta, si degrada a regole deterministiche
  **dichiarando il motivo**: il client non riceve mai un `500` per colpa del
  modello, e nei test il percorso a regole è verificato senza rete.
- **Nella ricerca naturale il residuo non diventa subito una query.** "una radio
  jazz italiana per rilassarmi" deve produrre `tags: jazz` + `IT`, non una query
  di nome con "per rilassarmi": quest'ultima azzererebbe i risultati. Il testo
  libero resta `q` solo quando non c'è nessun filtro forte.
- **SSE e non WebSocket per il tempo reale (X5).** Il flusso è a senso unico: con
  SSE il browser si riconnette **da solo** rispettando il `retry` annunciato,
  quindi non c'è codice di riconnessione da scrivere (e da sbagliare). Un
  WebSocket avrebbe richiesto una libreria e la gestione manuale del backoff.
- **L'annuncio viaggia su Redis pub/sub, non in memoria.** Con più istanze del
  backend il client SSE può essere collegato a un'istanza diversa da quella che
  ha sincronizzato: una lista in memoria funzionerebbe in sviluppo e fallirebbe
  in produzione, che è il tipo di difetto peggiore. Il subscriber usa una
  connessione dedicata (`duplicate()`), perché in `subscribe` una connessione si
  blocca sul canale.
- **Dietro un proxy l'SSE richiede due configurazioni, non zero.**
  `X-Accel-Buffering: no` nel backend e `proxy_buffering off` in nginx: senza,
  gli eventi restano nel buffer del proxy e non arrivano mai. Non è una teoria:
  è stato verificato con `curl -N` attraverso nginx, con l'evento pubblicato a
  mano su Redis.

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

- **Rate limiting e refresh token (bonus X6)**: chiusi — vedi la sezione *Sicurezza
  e quote (X6)* nel README. Restano dichiarati i limiti: il JWT già emesso non si
  revoca al logout, la rotazione non traccia la "famiglia" dei gettoni e la
  finestra del contatore è fissa (non sliding).
- **Ricerca in linguaggio naturale (bonus X3)**: chiusa — sezione *Ricerca in
  linguaggio naturale (X3)* nel README. La duplicazione fra `aiService.ts` e
  `modelClient.ts` è dichiarata e motivata lì.
- **Notizie in tempo reale (bonus X5)**: chiusa — sezione *Notizie in tempo reale
  (X5)* nel README. Limiti dichiarati: il flusso (best effort) tace se Redis è
  giù e non c'è coda per chi era disconnesso.
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