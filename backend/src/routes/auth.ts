import { Router } from 'express';
import { z } from 'zod';
import { AuthError, loginUser, registerUser } from '../services/authService';
import { errorContext, logger } from '../utils/logger';

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
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
    res.json(result);
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    logger.error('Unexpected error during login', errorContext(error));
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
