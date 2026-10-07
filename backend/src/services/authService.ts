import { compare, hash } from 'bcryptjs';
import { sign, verify, type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../db/prisma';

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
