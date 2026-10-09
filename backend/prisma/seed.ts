import { prisma } from '../src/db/prisma';
import { errorContext, logger } from '../src/utils/logger';

interface SeedPost {
  externalId: string;
  title: string;
  content: string;
  publishedAt: Date;
}

/**
 * Initial data required by the delivery (D1).
 *
 * It is a single, **explicitly labelled** demo row — not fake news: the real
 * headlines come from the external feed and are imported by
 * `src/services/newsSyncService.ts` at boot and then periodically. Keeping one
 * declared sample proves that the table, the API and the Redis cache work even
 * before the first synchronisation.
 *
 * Idempotent: running the seed twice never duplicates rows.
 */
const seedPosts: SeedPost[] = [
  {
    externalId: 'seed-contenuto-demo',
    title: 'Contenuto di esempio (seed) — non è una notizia reale',
    content:
      'Questa riga è inserita automaticamente dal seed del progetto e serve come ' +
      'dato iniziale di dimostrazione: verifica che la tabella dei post, l’API e ' +
      'la cache Redis funzionino anche prima della prima sincronizzazione. Le ' +
      'notizie reali vengono importate dal feed esterno dal backend all’avvio e ' +
      'poi a intervalli regolari, quindi non è necessario inventarne.',
    publishedAt: new Date('2026-01-01T08:00:00.000Z'),
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
