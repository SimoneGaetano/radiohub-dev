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
│   │   ├── routes/      # Rotte HTTP (health, radios, auth, favorites, posts)
│   │   ├── services/    # Logica di dominio (radio, auth, summary)
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
├── TASKS.md             # Roadmap delle task
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
   - `POST http://localhost:4000/api/auth/register` — registrazione (`{ email, password }`)
   - `POST http://localhost:4000/api/auth/login` — login → `{ token, user }`
   - `GET|POST|DELETE http://localhost:4000/api/favorites` — preferiti (richiede `Authorization: Bearer <token>`)
   - `GET http://localhost:4000/api/posts` — notizie dal DB
   - `POST http://localhost:4000/api/posts/:id/summary` — genera/legge il riassunto AI (mock)

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
  e streaming **HLS** (`.m3u8`) tramite `hls.js`.
- **Autenticazione** con modale login/registrazione; il token JWT viene salvato
  in `localStorage` e nello store Redux.
- **Notizie** con griglia articoli e pulsante "Riassumi con AI" che chiama
  `POST /api/posts/:id/summary`.

## Script frontend

| Script              | Descrizione                            |
| ------------------- | -------------------------------------- |
| `npm run dev`       | Dev-server Vite con proxy `/api`       |
| `npm run build`     | Type-check (`tsc --noEmit`) + build    |
| `npm run typecheck` | Solo controllo dei tipi                |
| `npm run preview`   | Serve la build di produzione          |
