import { Router } from 'express';
import { prisma } from '../db/prisma';
import { summaryService } from '../services/summaryService';
import { errorContext, logger } from '../utils/logger';

export const postsRouter = Router();

/** Lists the news posts stored in the database. */
postsRouter.get('/posts', async (_req, res) => {
  try {
    const posts = await prisma.post.findMany({
      orderBy: { publishedAt: 'desc' },
    });
    res.json({ data: posts });
  } catch (error) {
    logger.error('Unexpected error while listing posts', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Returns the AI summary of a post: reads it from the DB when already present,
 * otherwise generates it (mock provider) and persists it on `Post.summary`.
 */
postsRouter.post('/posts/:id/summary', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  try {
    const result = await summaryService.summarize(id);
    if (!result) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    res.json({ data: result });
  } catch (error) {
    logger.error(
      'Unexpected error while generating summary',
      errorContext(error),
    );
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
