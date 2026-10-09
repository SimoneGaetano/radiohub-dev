import { createHash, randomBytes } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { sign, verify, type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../db/prisma';
import { redis } from '../redis/client';
import { errorContext, logger } from '../utils/logger';

const SALT_ROUNDS = 10;

/** Authenticated principal attached to the request by `authenticateJWT`. */
export interface AuthUser {
  id: string;
  email: string;
}

/** Safe representation of a user (never exposes the password hash). */
export interface PublicUser {
  id: string;
  email: string;
  createdAt: Date;
}

/** Error carrying the HTTP status the route should respond with. */
export class AuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

interface AccessTokenPayload extends JwtPayload {
  email?: string;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function toPublicUser(user: {
  id: string;
  email: string;
  createdAt: Date;
}): PublicUser {
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

/**
 * Creates a new user with a bcrypt-hashed password.
 * Throws `AuthError(409)` when the email is already registered.
 */
export async function registerUser(
  email: string,
  password: string,
): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AuthError(409, 'Email already registered');
  }

  const passwordHash = await hash(password, SALT_ROUNDS);

  try {
    const user = await prisma.user.create({
      data: { email, password: passwordHash },
    });
    return toPublicUser(user);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AuthError(409, 'Email already registered');
    }
    throw error;
  }
}

/**
 * Verifies the credentials and returns a signed JWT plus the public user.
 * Throws `AuthError(401)` on invalid credentials.
 */
export async function loginUser(
  email: string,
  password: string,
): Promise<{ token: string; user: PublicUser }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AuthError(401, 'Invalid email or password');
  }

  const passwordMatches = await compare(password, user.password);
  if (!passwordMatches) {
    throw new AuthError(401, 'Invalid email or password');
  }

  const payload: AccessTokenPayload = { sub: user.id, email: user.email };
  const token = sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });

  return { token, user: toPublicUser(user) };
}

/** Utente pubblico per id: serve al refresh, che conosce solo l'id di sessione. */
export async function findPublicUser(id: string): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? toPublicUser(user) : null;
}

/**
 * Firma un access token JWT. Estratto da `loginUser` perché lo firma anche il
 * refresh (X6): le due rotte devono emettere token identici, non due varianti.
 */
export function issueAccessToken(user: { id: string; email: string }): string {
  const payload: AccessTokenPayload = { sub: user.id, email: user.email };
  return sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

/**
 * X6 — refresh token.
 *
 * È un valore **opaco** (32 byte casuali, non un JWT) salvato in Redis: un JWT
 * non si può revocare, un token in uno store sì — è esattamente il problema che
 * il refresh risolve (logout vero, sessioni brevi, credenziali non ripetute).
 *
 * In Redis si salva l'**hash** del token, non il token: chi legge un dump di
 * Redis non ottiene sessioni utilizzabili.
 */
function refreshTokenKey(token: string): string {
  const digest = createHash('sha256').update(token).digest('hex');
  return `auth:refresh:${digest}`;
}

/**
 * Emette un refresh token e lo registra per l'utente.
 *
 * Restituisce `null` se Redis non risponde: la sessione breve resta valida, si
 * perde solo la possibilità di rinnovarla. Scelta coerente con la cache di B3 —
 * un Redis giù peggiora il servizio, non lo spegne.
 */
export async function issueRefreshToken(
  userId: string,
): Promise<string | null> {
  const token = randomBytes(32).toString('base64url');

  try {
    await redis.set(
      refreshTokenKey(token),
      userId,
      'EX',
      env.REFRESH_TOKEN_TTL_SECONDS,
    );
    return token;
  } catch (error) {
    logger.warn('Refresh token store unavailable, session not renewable', {
      ...errorContext(error),
      userId,
    });
    return null;
  }
}

/**
 * Consuma un refresh token (**monouso**) e ne emette uno nuovo: è la rotazione,
 * la pratica che limita la finestra di un token rubato. Un token già usato non
 * esiste più nello store, quindi un secondo tentativo con lo stesso valore
 * riceve `401`.
 *
 * Throws `AuthError(401)` se il token è sconosciuto o scaduto;
 * `AuthError(503)` se Redis non risponde (è un guasto nostro, non un token
 * invalido: il client non deve cancellare la sessione).
 */
export async function rotateRefreshToken(
  token: string,
): Promise<{ userId: string; refreshToken: string | null }> {
  let userId: string | null;

  try {
    userId = await redis.get(refreshTokenKey(token));
  } catch (error) {
    logger.error('Refresh token store unavailable', errorContext(error));
    throw new AuthError(503, 'Session store unavailable');
  }

  if (!userId) {
    throw new AuthError(401, 'Invalid or expired refresh token');
  }

  await redis.del(refreshTokenKey(token));
  const refreshToken = await issueRefreshToken(userId);

  return { userId, refreshToken };
}

/**
 * Revoca un refresh token (logout). Idempotente e silenziosa: un token
 * sconosciuto produce lo stesso esito di uno valido, così la rotta non rivela
 * se un token esisteva.
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  try {
    await redis.del(refreshTokenKey(token));
  } catch (error) {
    logger.warn('Refresh token could not be revoked', errorContext(error));
  }
}

/**
 * Verifies a JWT and returns the authenticated principal.
 * Throws `AuthError(401)` when the token is missing, malformed or expired.
 */
export function verifyAccessToken(token: string): AuthUser {
  let decoded: string | JwtPayload;

  try {
    decoded = verify(token, env.JWT_SECRET);
  } catch {
    throw new AuthError(401, 'Invalid or expired token');
  }

  if (typeof decoded === 'string' || typeof decoded.sub !== 'string') {
    throw new AuthError(401, 'Invalid token payload');
  }

  const sub: string = decoded.sub;
  const { email } = decoded as AccessTokenPayload;

  return {
    id: sub,
    email: typeof email === 'string' ? email : '',
  };
}
