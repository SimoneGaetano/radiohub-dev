import type { NextFunction, Request, Response } from 'express';
import {
  AuthError,
  verifyAccessToken,
  type AuthUser,
} from '../services/authService';

const BEARER_PREFIX = 'Bearer ';

/**
 * Express middleware validating a `Bearer` JWT and attaching the authenticated
 * user to `req.user`. Responds `401` when the token is missing or invalid.
 */
export function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (token.length === 0) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Returns the authenticated user, or throws if `authenticateJWT` did not run.
 */
export function requireUser(req: Request): AuthUser {
  if (!req.user) {
    throw new Error('Authenticated user is missing from the request');
  }
  return req.user;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
