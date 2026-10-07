import { prisma } from '../src/db/prisma';
import { errorContext, logger } from '../src/utils/logger';

interface SeedPost {
  externalId: string;
  title: string;
  content: string;
  publishedAt: Date;
}

/**
 * Idempotent sample content: running the seed twice never duplicates rows.
 */
const seedPosts: SeedPost[] = [
  {
    externalId: 'radiohub-launch',
    title: 'Nasce RadioHub: la piattaforma per ascoltare radio da tutto il mondo',
    content:
      'RadioHub debutta oggi con un catalogo di migliaia di stazioni radio internazionali. ' +
      'La piattaforma consente di cercare un programma per nome, ascoltarlo in streaming e ' +
      'salvare le stazioni preferite nel proprio profilo. Dietro il sipario un motore di ' +
      'ricerca che interroga una fonte esterna, con cache Redis per ridurre i tempi di risposta.',
    publishedAt: new Date('2026-01-15T09:00:00.000Z'),
  },
  {
    externalId: 'radio-trends-2026',
    title: 'Le tendenze della radio online nel 2026',
    content:
      'La radio online continua a crescere, trainata dai podcast e dai format on-demand. ' +
      'I listener cercano stazioni più personalizzate, con filtri per genere, paese e lingua. ' +
      'Gli operatori investono sempre più nella qualità audio e nei formati brevi, pensati ' +
      'per essere fruiti durante gli spostamenti.',
    publishedAt: new Date('2026-02-03T08:30:00.000Z'),
  },
  {
    externalId: 'guide-first-radio',
    title: 'Guida: come scegliere la stazione giusta per ogni momento',
    content:
      'Colazione, studio o serata? Ogni momento della giornata ha la sua colonna sonora. ' +
      'Un buon punto di partenza è cercare per nome o per genere e ascoltare un paio di ' +
      'minuti di anteprima prima di scegliere. Le stazioni preferite restano sempre a portata ' +
      'di mano dalla barra del player.',
    publishedAt: new Date('2026-03-11T07:15:00.000Z'),
  },
  {
    externalId: 'streaming-hls-redis',
    title: 'Dietro le quinte: streaming HLS e cache Redis',
    content:
      'Come vengono servite le stazioni audio? Lo streaming HLS suddivide il flusso in ' +
      'frammenti, così il player può adattare la qualità alla connessione disponibile. ' +
      'Le ricerche più frequenti, invece, vengono memorizzate in Redis per un tempo limitato, ' +
      'riducendo sia il carico sui server esterni sia i tempi di attesa per l’utente.',
    publishedAt: new Date('2026-04-22T16:45:00.000Z'),
  },
  {
    externalId: 'favorites-area-utente',
    title: 'Aggiornamento: area utente, preferiti e riassunti automatici',
    content:
      'Con l’ultimo aggiornamento è arrivata l’area utente: registrazione con email, accesso ' +
      'sicuro tramite token e una sezione dedicata ai preferiti, sincronizzata su tutti i ' +
      'dispositivi. Tra le novità anche i riassunti automatici degli articoli, generati in pochi ' +
      'secondi per aiutarti a scegliere cosa leggere.',
    publishedAt: new Date('2026-05-30T10:00:00.000Z'),
  },
];

async function main(): Promise<void> {
  for (const post of seedPosts) {
    await prisma.post.upsert({
      where: { externalId: post.externalId },
      create: post,
      update: {
        title: post.title,
        content: post.content,
        publishedAt: post.publishedAt,
      },
    });
  }

  logger.info('Seed completato', { posts: seedPosts.length });
}

main()
  .catch((error: unknown) => {
    logger.error('Seed fallito', errorContext(error));
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });