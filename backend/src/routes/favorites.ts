import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { authenticateJWT, requireUser } from '../middleware/authenticateJWT';
import { errorContext, logger } from '../utils/logger';

const addFavoriteSchema = z.object({
  radioId: z.string().trim().min(1).max(128),
});

export const favoritesRouter = Router();

/** Lists the favourites of the authenticated user. */
favoritesRouter.get('/favorites', authenticateJWT, async (req, res) => {
  try {
    const user = requireUser(req);
    const favorites = await prisma.favorite.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: favorites });
  } catch (error) {
    logger.error('Unexpected error while listing favorites', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** Adds a station to the authenticated user's favourites (idempotent). */
favoritesRouter.post('/favorites', authenticateJWT, async (req, res) => {
  const parsed = addFavoriteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const user = requireUser(req);
    const favorite = await prisma.favorite.upsert({
      where: {
        userId_radioId: { userId: user.id, radioId: parsed.data.radioId },
      },
      create: { userId: user.id, radioId: parsed.data.radioId },
      update: {},
    });
    res.status(201).json({ data: favorite });
  } catch (error) {
    logger.error('Unexpected error while adding favorite', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** Removes a station from the authenticated user's favourites. */
favoritesRouter.delete('/favorites/:radioId', authenticateJWT, async (req, res) => {
  const { radioId } = req.params;
  if (!radioId) {
    res.status(400).json({ error: 'radioId is required' });
    return;
  }

  try {
    const user = requireUser(req);
    const result = await prisma.favorite.deleteMany({
      where: { userId: user.id, radioId },
    });

    if (result.count === 0) {
      res.status(404).json({ error: 'Favorite not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    logger.error('Unexpected error while deleting favorite', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
