/**
 * Structured server-side logging.
 *
 * Every entry is a single JSON line so Vercel's log viewer can filter on
 * `level`, `event` and `requestId`. Never log ticket bodies, email addresses,
 * tokens or any other personal data — log identifiers instead.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function configuredLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return raw === 'debug' || raw === 'warn' || raw === 'error' ? raw : 'info';
}

export type LogContext = {
  requestId?: string;
  userId?: string;
  route?: string;
  action?: string;
  durationMs?: number;
  [key: string]: unknown;
};

function emit(level: LogLevel, event: string, context: LogContext = {}) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configuredLevel()]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...context,
  };

  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (event: string, context?: LogContext) => emit('debug', event, context),
  info: (event: string, context?: LogContext) => emit('info', event, context),
  warn: (event: string, context?: LogContext) => emit('warn', event, context),
  error: (event: string, context?: LogContext) => emit('error', event, context),
};

/** Turns an unknown thrown value into a loggable shape without leaking internals. */
export function describeError(error: unknown): { name: string; message: string; code?: string } {
  if (error instanceof Error) {
    const maybeCode = (error as unknown as { code?: unknown }).code;
    return {
      name: error.name,
      message: error.message,
      ...(typeof maybeCode === 'string' ? { code: maybeCode } : {}),
    };
  }
  return { name: 'UnknownError', message: String(error) };
}
