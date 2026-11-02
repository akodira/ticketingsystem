/**
 * Typed application errors.
 *
 * Services throw these; server actions catch them and return a translation key,
 * never a raw database message. Unexpected errors are logged with a request id
 * and surface as the generic message.
 */

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'CONFIGURATION'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  CONFIGURATION: 500,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly i18nKey: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    i18nKey: string,
    options?: { message?: string; details?: Record<string, unknown> },
  ) {
    super(options?.message ?? `${code}: ${i18nKey}`);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = STATUS[code];
    this.i18nKey = i18nKey;
    this.details = options?.details;
  }
}

export const errors = {
  unauthenticated: () => new AppError('UNAUTHENTICATED', 'errors.unauthorized'),
  forbidden: (key = 'errors.unauthorized') => new AppError('FORBIDDEN', key),
  notFound: () => new AppError('NOT_FOUND', 'errors.notFound'),
  validation: (key = 'validation.required', details?: Record<string, unknown>) =>
    new AppError('VALIDATION', key, { details }),
  conflict: (key: string) => new AppError('CONFLICT', key),
  rateLimited: () => new AppError('RATE_LIMITED', 'errors.rateLimited'),
  configuration: (message: string) => new AppError('CONFIGURATION', 'errors.generic', { message }),
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
