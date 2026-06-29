/**
 * Result type utilities for consistent error handling
 */

export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Executes the ok operation.
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Executes the err operation.
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Executes the is ok operation.
 */
export function isOk<T, E>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success;
}

/**
 * Executes the is err operation.
 */
export function isErr<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return !result.success;
}

/**
 * Executes the unwrap operation.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.success) {
    return result.data;
  }
  throw (result as { success: false; error: E }).error;
}

/**
 * Executes the unwrap or operation.
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.success ? result.data : defaultValue;
}

/**
 * Executes the map result operation.
 */
export function mapResult<T, U, E>(
  result: Result<T, E>,
  fn: (data: T) => U
): Result<U, E> {
  if (result.success) {
    return { success: true, data: fn(result.data) };
  }
  return result as Result<U, E>;
}

/**
 * Executes the map error operation.
 */
export function mapError<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (result.success) {
    return result;
  }
  return { success: false, error: fn((result as { success: false; error: E }).error) };
}
