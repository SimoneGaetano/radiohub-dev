import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { authenticateJWT, requireUser } from '../middleware/authenticateJWT';
import { errorContext, logger } from '../utils/logger';

/** At most ten recents per user, mirroring the device-side behaviour. */
const MAX_RECENTS = 10;

const recentSchema = z.object({
  radioId: z.string().trim().min(1).max(128),
});

export const recentsRouter = Router();

/**
 * Recently played stations of the authenticated user (per-account history, so
 * it follows the user across devices). Guests keep their own list on the device.
 */
recentsRouter.get('/recents', authenticateJWT, async (req, res) => {
  try {
    const user = requireUser(req);
    const recents = await prisma.recentPlay.findMany({
      where: { userId: user.id },
      orderBy: { playedAt: 'desc' },
      take: MAX_RECENTS,
    });
    res.json({ data: recents });
  } catch (error) {
    logger.error('Unexpected error while listing recents', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Records a play: replaying a station moves it back to the top instead of
 * creating a duplicate row, and the list is trimmed to `MAX_RECENTS`.
 */
recentsRouter.post('/recents', authenticateJWT, async (req, res) => {
  const parsed = recentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const user = requireUser(req);
    const recent = await prisma.recentPlay.upsert({
      where: {
        userId_radioId: { userId: user.id, radioId: parsed.data.radioId },
      },
      create: { userId: user.id, radioId: parsed.data.radioId },
      update: { playedAt: new Date() },
    });

    const keep = await prisma.recentPlay.findMany({
      where: { userId: user.id },
      orderBy: { playedAt: 'desc' },
      take: MAX_RECENTS,
      select: { id: true },
    });
    await prisma.recentPlay.deleteMany({
      where: { userId: user.id, id: { notIn: keep.map((row) => row.id) } },
    });

    res.status(201).json({ data: recent });
  } catch (error) {
    logger.error('Unexpected error while storing a recent', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/** Empties the recently played history of the authenticated user. */
recentsRouter.delete('/recents', authenticateJWT, async (req, res) => {
  try {
    const user = requireUser(req);
    await prisma.recentPlay.deleteMany({ where: { userId: user.id } });
    res.status(204).send();
  } catch (error) {
    logger.error('Unexpected error while clearing recents', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});