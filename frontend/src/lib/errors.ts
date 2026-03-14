/**
 * Error Handling Utilities
 *
 * Provides consistent error handling and display utilities.
 */

/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Error thrown when a resource is not found
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id "${id}" not found` : `${resource} not found`,
      'NOT_FOUND',
      404
    );
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when a user is not authorized
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when a network request fails
 */
export class NetworkError extends AppError {
  constructor(message = 'Network request failed', statusCode?: number) {
    super(message, 'NETWORK_ERROR', statusCode);
    this.name = 'NetworkError';
  }
}

/**
 * Extract a user-friendly error message from an unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'An unexpected error occurred';
}

/**
 * Check if an error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  return error instanceof NetworkError;
}

/**
 * Check if an error is a not found error
 */
export function isNotFoundError(error: unknown): boolean {
  return error instanceof NotFoundError;
}

/**
 * Check if an error is an unauthorized error
 */
export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof UnauthorizedError;
}

/**
 * Check if an error is retryable (network errors, 5xx status codes)
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof NetworkError) {
    return true;
  }

  if (error instanceof AppError && error.statusCode) {
    return error.statusCode >= 500;
  }

  return false;
}
