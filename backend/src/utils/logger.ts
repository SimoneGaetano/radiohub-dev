import { env } from '../config/env';

/*
 * Unico file autorizzato a scrivere sulla console: `no-console` è disattivato
 * per questo percorso in `eslint.config.mjs`, quindi non servono più i commenti
 * di disattivazione puntuali.
 */

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** Numeric weight of each level, used to filter by `LOG_LEVEL`. */
const LEVEL_WEIGHT: Record<LogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
};

const threshold = LEVEL_WEIGHT[env.LOG_LEVEL];

export interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  time: string;
  service: string;
  message: string;
  [key: string]: unknown;
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVEL_WEIGHT[level] < threshold) {
    return;
  }

  const entry: LogEntry = {
    level,
    time: new Date().toISOString(),
    service: 'radiohub-backend',
    message,
    ...context,
  };

  // In production we emit pure JSON lines (one object per line) so that log
  // collectors can parse them; in development we favour readability.
  const line =
    env.NODE_ENV === 'production'
      ? JSON.stringify(entry)
      : `[${entry.time}] ${level.toUpperCase()} ${message}${
          context ? ` ${JSON.stringify(context)}` : ''
        }`;

  if (level === 'fatal' || level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

/**
 * Application logger with level filtering driven by `LOG_LEVEL`.
 */
export const logger = {
  fatal: (message: string, context?: LogContext): void =>
    write('fatal', message, context),
  error: (message: string, context?: LogContext): void =>
    write('error', message, context),
  warn: (message: string, context?: LogContext): void =>
    write('warn', message, context),
  info: (message: string, context?: LogContext): void =>
    write('info', message, context),
  debug: (message: string, context?: LogContext): void =>
    write('debug', message, context),
  trace: (message: string, context?: LogContext): void =>
    write('trace', message, context),
};

/** Convenience helper to turn an unknown thrown value into log context. */
export function errorContext(error: unknown): LogContext {
  return {
    message: describe(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}
