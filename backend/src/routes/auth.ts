import { Router } from 'express';
import { z } from 'zod';
import {
  AuthError,
  findPublicUser,
  issueAccessToken,
  issueRefreshToken,
  loginUser,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../services/authService';
import { errorContext, logger } from '../utils/logger';

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
});

/** X6: il refresh token è opaco (base64url di 32 byte), non un JWT. */
const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(1).max(512),
});

export const authRouter = Router();

authRouter.post('/auth/register', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const user = await registerUser(parsed.data.email, parsed.data.password);
    res.status(201).json({ user });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error('Unexpected error during registration', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

authRouter.post('/auth/login', async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const result = await loginUser(parsed.data.email, parsed.data.password);
    res.json({
      token: result.token,
      // X6: secondo gettone, di sola rinnovazione. Vale `null` se lo store delle
      // sessioni non risponde: la sessione breve resta valida, si perde solo il
      // rinnovo automatico.
      refreshToken: await issueRefreshToken(result.user.id),
      user: result.user,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error('Unexpected error during login', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * X6 — rinnova la sessione senza rimandare le credenziali.
 *
 * Il refresh token è **monouso**: viene consumato e sostituito (rotazione), così
 * un token intercettato vale una sola volta e non per 7 giorni. La risposta ha
 * la stessa forma del login, quindi il client ha una sola strada da conoscere.
 */
authRouter.post('/auth/refresh', async (req, res) => {
  const parsed = refreshTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid payload',
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const { userId, refreshToken } = await rotateRefreshToken(
      parsed.data.refreshToken,
    );
    const user = await findPublicUser(userId);

    if (!user) {
      // Sessione valida ma utente non più esistente: non c'è nulla da rinnovare.
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    res.json({ token: issueAccessToken(user), refreshToken, user });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error('Unexpected error during refresh', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * X6 — revoca la sessione sul server.
 *
 * Prima del refresh token il logout era solo lato client: il JWT restava valido
 * fino alla scadenza. Ora il gettone viene cancellato dallo store, quindi non è
 * più rinnovabile.
 *
 * Risponde sempre `204`, anche con token sconosciuto o assente: idempotente e
 * senza indicazioni su quali token esistano.
 */
authRouter.post('/auth/logout', async (req, res) => {
  const parsed = refreshTokenSchema.safeParse(req.body);
  if (parsed.success) {
    await revokeRefreshToken(parsed.data.refreshToken);
  }
  res.status(204).end();
});
