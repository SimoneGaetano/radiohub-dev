/**
 * OpenAPI 3.1 description of the RadioHub API (B5).
 *
 * Kept as a TypeScript module (instead of a YAML file) so it is type-checked,
 * bundled by `tsc` into `dist/` and **cannot drift from the image**: no extra
 * file to copy in the Dockerfile, no runtime file-read that can fail.
 *
 * The shapes mirror `src/routes/*` and are asserted by `tests/docs.test.ts`.
 */
export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'RadioHub API',
    version: '0.1.0',
    license: {
      name: 'Uso riservato — prova tecnica 22HBG S.r.l.',
      identifier: 'LicenseRef-Proprietary',
    },
    description: [
      'Backend unico punto di accesso alle fonti esterne: ricerca radio',
      '(FM-World, con fallback automatico su Radio Browser quando non risponde),',
      'feed notizie (CloudFront), cache Redis, preferiti e riassunti AI per utente.',
      '',
      'Errori comuni: `400` payload/query non valida, `401` token mancante o non',
      'valido, `502` fonte esterna non raggiungibile, `504` timeout della fonte.',
      '',
      '`GET /api/radios` dichiara in `meta.source` la fonte che ha risposto e in',
      '`meta.fallback` chi ha preso il posto di FM-World e perché.',
    ].join('\n'),
  },
  servers: [
    {
      url: 'http://localhost:4000',
      description: 'Backend in locale (sviluppo)',
    },
    {
      url: 'http://localhost:8080',
      description: 'Stack completo attraverso il reverse proxy di nginx',
    },
  ],
  /**
   * Public by default: the operations that need a token (favorites, recents,
   * sync, per-user summaries) declare their own `security`. Declaring it here
   * keeps every operation explicit.
   */
  security: [],
  tags: [
    { name: 'Health', description: 'Liveness e readiness del servizio' },
    { name: 'Radios', description: 'Ricerca e dettaglio delle stazioni radio' },
    { name: 'Posts', description: 'Notizie sincronizzate dal feed esterno' },
    { name: 'Summaries', description: 'Riassunti AI dei post' },
    { name: 'Auth', description: 'Registrazione e login (JWT)' },
    {
      name: 'Favorites',
      description: 'Radio preferite dell’utente autenticato',
    },
    { name: 'Recents', description: 'Cronologia di ascolto dell’utente' },
    { name: 'Media', description: 'Proxy immagini same-origin' },
    { name: 'Admin', description: 'Sincronizzazione manuale del feed' },
  ],
  paths: {
    '/': {
      get: {
        tags: ['Health'],
        operationId: 'getApiInfo',
        summary: 'Informazioni sull’API',
        responses: {
          '200': {
            description: 'Nome e versione del servizio',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', example: 'RadioHub API' },
                    version: { type: 'string', example: '0.1.0' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/health': {
      get: {
        tags: ['Health'],
        operationId: 'getHealth',
        summary: 'Liveness probe',
        description: 'Il processo risponde. Non tocca il database.',
        responses: {
          '200': {
            description: 'Servizio vivo',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Health' },
              },
            },
          },
        },
      },
    },
    '/api/health/ready': {
      get: {
        tags: ['Health'],
        operationId: 'getReadiness',
        summary: 'Readiness probe (D5)',
        description: 'Verifica la connessione a PostgreSQL e Redis.',
        responses: {
          '200': {
            description: 'Tutte le dipendenze raggiungibili',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Readiness' },
              },
            },
          },
          '503': {
            description: 'Almeno una dipendenza non disponibile',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Readiness' },
              },
            },
          },
        },
      },
    },
    '/api/radios': {
      get: {
        tags: ['Radios'],
        operationId: 'getRadios',
        summary: 'Cerca stazioni radio (proxy alla fonte esterna)',
        description: [
          'La ricerca è inoltrata dal backend, che tiene le credenziali lato',
          'server (B1) e mette in cache la risposta in Redis (B3, header',
          '`X-Cache: HIT|MISS`).',
          '',
          '`query` e `q` sono equivalenti: la traccia usa `query`, il frontend',
          '`q`. `tag`, `countryCode`, `bitrateMin` e `order` sono i filtri',
          'nativi usati dalle pill dei generi.',
        ].join('\n'),
        parameters: [
          {
            name: 'query',
            in: 'query',
            description: 'Testo libero (alias: `q`)',
            required: false,
            schema: { type: 'string', maxLength: 100, example: 'jazz' },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Numero di risultati per pagina (1-50)',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          },
          {
            name: 'page',
            in: 'query',
            description: 'Pagina richiesta (a partire da 1)',
            required: false,
            schema: { type: 'integer', minimum: 1, default: 1 },
          },
          {
            name: 'tag',
            in: 'query',
            description:
              'Tag di genere separati da virgola (max 5), provati in ordine finché uno restituisce risultati.',
            required: false,
            schema: { type: 'string', example: 'chillout,lounge,ambient' },
          },
          {
            name: 'countryCode',
            in: 'query',
            description: 'Codice paese ISO a 2 lettere',
            required: false,
            schema: { type: 'string', pattern: '^[A-Za-z]{2}$', example: 'IT' },
          },
          {
            name: 'bitrateMin',
            in: 'query',
            description: 'Bitrate minimo in kbps',
            required: false,
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 10000,
              example: 128,
            },
          },
          {
            name: 'order',
            in: 'query',
            description: 'Ordinamento lato fonte',
            required: false,
            schema: {
              type: 'string',
              enum: ['votes', 'name', 'clickcount', 'bitrate'],
            },
          },
        ],
        responses: {
          '200': {
            description: 'Elenco normalizzato di stazioni',
            headers: {
              'X-Cache': {
                description: 'Esito della cache Redis',
                schema: { type: 'string', enum: ['HIT', 'MISS'] },
              },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RadioList' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '502': { $ref: '#/components/responses/BadGateway' },
          '504': { $ref: '#/components/responses/GatewayTimeout' },
        },
      },
    },
    '/api/radios/by-ids': {
      get: {
        tags: ['Radios'],
        operationId: 'getRadiosByIds',
        summary: 'Risolve stazioni a partire dagli id',
        description:
          'Usata per mostrare preferiti e cronologia salvati sul server anche su un altro dispositivo (B4).',
        parameters: [
          {
            name: 'ids',
            in: 'query',
            required: true,
            description: 'Da 1 a 50 id separati da virgola',
            schema: { type: 'string', example: 'a1b2c3,d4e5f6' },
          },
        ],
        responses: {
          '200': {
            description: 'Stazioni risolte (le sconosciute vengono omesse)',
            headers: {
              'X-Cache': { schema: { type: 'string', enum: ['HIT', 'MISS'] } },
            },
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RadioList' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '502': { $ref: '#/components/responses/BadGateway' },
          '504': { $ref: '#/components/responses/GatewayTimeout' },
        },
      },
    },
    '/api/media': {
      get: {
        tags: ['Media'],
        operationId: 'getMedia',
        summary: 'Proxy same-origin per le immagini delle stazioni',
        description: [
          'Il browser carica le copertine da qui, quindi il colore dominante',
          'dello sfondo del player funziona anche per gli host senza CORS.',
          '',
          'Guardie SSRF: solo `http`/`https`, niente credenziali nell’URL,',
          'risoluzione DNS con rifiuto di loopback/privati/link-local/multicast,',
          'redirect seguiti manualmente (max 3) rivalidando ogni meta.',
        ].join('\n'),
        parameters: [
          {
            name: 'url',
            in: 'query',
            required: true,
            description: 'URL assoluto dell’immagine',
            schema: { type: 'string', format: 'uri' },
          },
        ],
        responses: {
          '200': {
            description: 'Bytes dell’immagine',
            headers: {
              'Cache-Control': {
                schema: { type: 'string', example: 'public, max-age=86400' },
              },
            },
            content: {
              'image/*': { schema: { type: 'string', format: 'binary' } },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '413': { $ref: '#/components/responses/PayloadTooLarge' },
          '415': { $ref: '#/components/responses/UnsupportedMedia' },
          '502': { $ref: '#/components/responses/BadGateway' },
          '504': { $ref: '#/components/responses/GatewayTimeout' },
        },
      },
    },
    '/api/posts': {
      get: {
        tags: ['Posts'],
        operationId: 'listPosts',
        summary: 'Elenca le notizie salvate (B2)',
        description: [
          'I post vengono dal feed esterno, non dal browser: il job periodico',
          'li sincronizza ogni 5 minuti e il risultato è in cache Redis (B3).',
          '',
          'Per un utente autenticato il campo `summary` è **il suo** riassunto;',
          'per gli ospiti è la cache condivisa.',
        ].join('\n'),
        parameters: [
          {
            name: 'title',
            in: 'query',
            required: false,
            description: 'Filtro parziale e case-insensitive sul titolo',
            schema: { type: 'string', maxLength: 200, example: 'radio' },
          },
          {
            name: 'items',
            in: 'query',
            required: false,
            description: 'Numero massimo di post (1-100)',
            schema: { type: 'integer', minimum: 1, maximum: 100, example: 10 },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            description: 'Alias di `items`',
            schema: { type: 'integer', minimum: 1, maximum: 100 },
          },
        ],
        responses: {
          '200': {
            description: 'Elenco di post ordinati per data di pubblicazione',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Post' },
                    },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
    '/api/posts/{id}/summary': {
      get: {
        tags: ['Summaries'],
        operationId: 'getPostSummary',
        summary: 'Riassunto AI di un post (A1)',
        description: [
          'Il primo risultato generato viene **salvato**, quindi le richieste',
          'successive non richiamano il modello (né per lo stesso testo né, se',
          'il testo cambia, con un riassunto obsoleto: viene rigenerato).',
          '',
          'Esposto anche in `POST` perché la prima chiamata ha un effetto: la',
          'SPA usa `POST`, mentre `GET` resta per conformità alla traccia e per',
          'un semplice `curl`.',
        ].join('\n'),
        security: [{ bearerAuth: [] }, {}],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Id interno del post',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Riassunto (generato ora o già memorizzato)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/Summary' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
      post: {
        tags: ['Summaries'],
        operationId: 'createPostSummary',
        summary: 'Riassunto AI di un post (idempotente dopo il primo giro)',
        security: [{ bearerAuth: [] }, {}],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': {
            description: 'Riassunto disponibile',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/Summary' },
                  },
                },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        operationId: 'registerUser',
        summary: 'Registrazione con email e password (B4)',
        description:
          'La password è cifrata con bcrypt prima di essere salvata.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Credentials' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Utente creato',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { user: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '409': {
            description: 'Email già registrata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        operationId: 'loginUser',
        summary: 'Login e rilascio del JWT (B4)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Credentials' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Token e dati dell’utente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': {
            description: 'Credenziali non valide',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '429': { $ref: '#/components/responses/TooManyRequests' },
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['Auth'],
        operationId: 'refreshSession',
        summary: 'Rinnova la sessione senza rimandare le credenziali (X6)',
        description:
          'Il refresh token è **monouso**: viene consumato e sostituito (rotazione), così un gettone intercettato vale una volta sola e non per la sua intera durata. La risposta ha la stessa forma del login.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RefreshTokenRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Nuova coppia di gettoni e dati dell’utente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': {
            description: 'Refresh token sconosciuto, scaduto o già usato',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Invalid or expired refresh token' },
              },
            },
          },
          '429': { $ref: '#/components/responses/TooManyRequests' },
          '503': {
            description:
              'Store delle sessioni (Redis) non disponibile: è un guasto temporaneo, la sessione non va cancellata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { error: 'Session store unavailable' },
              },
            },
          },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        operationId: 'logoutSession',
        summary: 'Revoca il refresh token (X6)',
        description:
          'Il gettone non è più rinnovabile. Risponde `204` anche con gettone sconosciuto o assente: idempotente, e non rivela quali gettoni esistano. Il JWT già emesso resta valido fino alla sua scadenza (limite dichiarato nel README).',
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RefreshTokenRequest' },
            },
          },
        },
        responses: {
          '204': { description: 'Sessione revocata (nessun contenuto)' },
        },
      },
    },
    '/api/favorites': {
      get: {
        tags: ['Favorites'],
        operationId: 'listFavorites',
        summary: 'Radio preferite dell’utente autenticato (B4)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Elenco dei preferiti, dal più recente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Favorite' },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Favorites'],
        operationId: 'addFavorite',
        summary: 'Aggiunge una radio ai preferiti (idempotente)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['radioId'],
                properties: {
                  radioId: {
                    type: 'string',
                    maxLength: 128,
                    example: 'a1b2c3d4',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Preferito creato (o già esistente)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/Favorite' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/favorites/{radioId}': {
      delete: {
        tags: ['Favorites'],
        operationId: 'removeFavorite',
        summary: 'Rimuove una radio dai preferiti',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'radioId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '204': { description: 'Rimosso' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/api/recents': {
      get: {
        tags: ['Recents'],
        operationId: 'listRecents',
        summary: 'Stazioni ascoltate di recente (max 10)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Cronologia dell’utente, dalla più recente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Recent' },
                    },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Recents'],
        operationId: 'addRecent',
        summary: 'Registra un ascolto',
        description:
          'Ri-ascoltare una stazione la riporta in cima senza creare duplicati e la lista viene troncata a 10.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['radioId'],
                properties: { radioId: { type: 'string', maxLength: 128 } },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Ascolto registrato',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { data: { $ref: '#/components/schemas/Recent' } },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      delete: {
        tags: ['Recents'],
        operationId: 'clearRecents',
        summary: 'Svuota la cronologia di ascolto',
        security: [{ bearerAuth: [] }],
        responses: {
          '204': { description: 'Cronologia svuotata' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/api/sync': {
      post: {
        tags: ['Admin'],
        operationId: 'syncNews',
        summary: 'Forza una sincronizzazione manuale del feed (B2)',
        description: [
          'Restituisce quanti post sono stati **inseriti** (`created`) e',
          '**aggiornati** (`updated`) rispetto al feed, oltre a `fetched`',
          '(elementi ricevuti) e `skipped` (elementi scartati).',
          '',
          'Protetta dall’header `X-Sync-Key` (confronto constant-time): `401`',
          'con chiave errata e `503` se `SYNC_API_KEY` non è configurata',
          '(fail-closed). `409` se una sincronizzazione è già in corso.',
        ].join('\n'),
        security: [{ syncKey: [] }],
        responses: {
          '200': {
            description: 'Esito della sincronizzazione',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { $ref: '#/components/schemas/SyncResult' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '409': {
            description: 'Sincronizzazione già in corso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
          '502': { $ref: '#/components/responses/BadGateway' },
          '503': {
            description: 'Endpoint disabilitato: SYNC_API_KEY non configurata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
              },
            },
          },
        },
      },
    },
    '/api/ai/radio-info': {
      post: {
        tags: ['Radios'],
        operationId: 'generateRadioInfo',
        summary: 'Bio AI di una stazione radio (bonus)',
        description:
          'Se il provider non è disponibile (o manca la chiave) risponde comunque con un testo di fallback: non fallisce mai.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['radioId', 'radioName'],
                properties: {
                  radioId: { type: 'string', maxLength: 128 },
                  radioName: { type: 'string', maxLength: 128 },
                  country: { type: 'string', maxLength: 128 },
                  tags: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Bio generata (o fallback dinamico)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        radioId: { type: 'string' },
                        radioName: { type: 'string' },
                        bio: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'JWT ottenuto da `/api/auth/login`, inviato come `Authorization: Bearer <token>`.',
      },
      syncKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Sync-Key',
        description:
          'Segreto condiviso (`SYNC_API_KEY`) richiesto da `POST /api/sync`.',
      },
    },
    schemas: {
      Health: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          uptime: { type: 'number', example: 123.45 },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      Readiness: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['ready', 'not-ready'] },
          dependencies: {
            type: 'object',
            properties: {
              database: { type: 'string', enum: ['up', 'down'] },
              redis: { type: 'string', enum: ['up', 'down'] },
            },
          },
        },
      },
      Radio: {
        type: 'object',
        description:
          'Stazione normalizzata (sottoinsieme del payload di fonte)',
        properties: {
          id: {
            type: 'string',
            example: 'd3f1c2a4-0000-0000-0000-000000000000',
          },
          name: { type: 'string', example: 'Radio Bruno' },
          url: {
            type: 'string',
            description: 'URL dello stream (MP3/AAC/HLS)',
            example: 'https://stream.example/radio.mp3',
          },
          favicon: { type: 'string', example: 'https://cdn.example/logo.png' },
          country: { type: 'string', example: 'Italy' },
          countryCode: { type: 'string', example: 'IT' },
          language: { type: 'string', example: 'italian' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            example: ['pop', 'hits'],
          },
          votes: { type: 'integer', example: 4210 },
          codec: { type: 'string', example: 'MP3' },
          bitrate: { type: 'integer', example: 128 },
        },
      },
      RadioList: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/Radio' },
          },
          meta: {
            type: 'object',
            properties: {
              query: { type: ['string', 'null'] },
              limit: { type: 'integer' },
              page: { type: 'integer' },
              count: { type: 'integer' },
              requested: { type: 'integer' },
              source: {
                type: 'string',
                enum: ['fm-world', 'radio-browser'],
                description:
                  'Fonte che ha risposto davvero (B1): `fm-world` è la fonte primaria indicata dalla traccia, `radio-browser` il fallback.',
                example: 'radio-browser',
              },
              fallback: {
                type: ['object', 'null'],
                description:
                  'Valorizzato quando la ricerca non è passata da FM-World: dice chi ha risposto al suo posto e perché.',
                properties: {
                  from: { type: 'string', enum: ['fm-world', 'radio-browser'] },
                  to: { type: 'string', enum: ['fm-world', 'radio-browser'] },
                  reason: {
                    type: 'string',
                    description: 'Motivo sintetico e stabile',
                    example: 'HTTP 403',
                  },
                },
              },
            },
          },
        },
      },
      Post: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          externalId: {
            type: 'string',
            description: 'Id nel feed di origine (chiave di deduplica)',
            example: '247409',
          },
          title: { type: 'string' },
          content: { type: 'string' },
          publishedAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          summary: {
            type: ['string', 'null'],
            description: 'Riassunto AI dell’utente, o `null` se non generato',
          },
        },
      },
      Summary: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          generated: {
            type: 'boolean',
            description:
              '`true` quando il testo è stato appena prodotto dal modello',
          },
          provider: { type: 'string', example: 'gemini' },
        },
      },
      Credentials: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'JWT da usare come Bearer' },
          refreshToken: {
            type: ['string', 'null'],
            description:
              'Gettone di rinnovo **monouso**, opaco (non un JWT). `null` quando lo store delle sessioni non risponde: la sessione breve resta valida, si perde il rinnovo automatico. Va usato solo su `POST /api/auth/refresh`.',
          },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      RefreshTokenRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', minLength: 1, maxLength: 512 },
        },
      },
      Favorite: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          radioId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Recent: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          radioId: { type: 'string' },
          playedAt: { type: 'string', format: 'date-time' },
        },
      },
      SyncResult: {
        type: 'object',
        properties: {
          fetched: {
            type: 'integer',
            description: 'Elementi ricevuti dal feed',
          },
          created: { type: 'integer', description: 'Post inseriti' },
          updated: { type: 'integer', description: 'Post aggiornati' },
          skipped: { type: 'integer', description: 'Elementi scartati' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Invalid query parameters' },
          message: { type: 'string' },
          details: {
            type: 'object',
            description: 'Errori per campo (Zod), quando presenti',
            additionalProperties: true,
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Parametri o payload non validi',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: 'Invalid query parameters',
              details: { limit: ['Number must be less than or equal to 50'] },
            },
          },
        },
      },
      Unauthorized: {
        description: 'Token assente, scaduto o non valido',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'Missing or malformed Authorization header' },
          },
        },
      },
      TooManyRequests: {
        description:
          'Quota di richieste esaurita (X6). Vale per tutte le rotte `/api` — 300 richieste al minuto per IP — con quote più strette su `login`/`register` (10 ogni 15 minuti) e sulle generazioni di riassunto AI (20 ogni 5 minuti, per utente). Gli health check (`/api/health*`) e la documentazione (`/api/docs`) sono esclusi dalla quota. La finestra riparte dopo i secondi indicati in `Retry-After`.',
        headers: {
          'Retry-After': {
            description: 'Secondi da attendere prima di ritentare',
            schema: { type: 'integer', example: 42 },
          },
          'RateLimit-Limit': {
            description: 'Quota della finestra corrente',
            schema: { type: 'integer', example: 300 },
          },
          'RateLimit-Remaining': {
            description: 'Richieste ancora disponibili',
            schema: { type: 'integer', example: 0 },
          },
          'RateLimit-Reset': {
            description: 'Secondi alla riapertura della finestra',
            schema: { type: 'integer', example: 42 },
          },
        },
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: 'Too many requests',
              details: { retryAfterSeconds: 42 },
            },
          },
        },
      },
      NotFound: {
        description: 'Risorsa inesistente',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { error: 'Post not found' },
          },
        },
      },
      UnsupportedMedia: {
        description: 'La risorsa richiesta non è un’immagine (proxy media)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      PayloadTooLarge: {
        description: 'Risorsa oltre il limite di 2 MB (proxy media)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      BadGateway: {
        description:
          'La fonte esterna ha risposto con un errore (messaggio in `message`)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: 'Bad Gateway',
              message: 'FM-World responded with status 403',
            },
          },
        },
      },
      GatewayTimeout: {
        description: 'La fonte esterna non ha risposto entro il timeout',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              error: 'Gateway Timeout',
              message: 'FM-World timed out',
            },
          },
        },
      },
    },
  },
} as const;
