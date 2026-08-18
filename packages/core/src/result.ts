/**
 * @name core/result
 * @description Result type utilities for consistent error handling.
 *
 * Provides a discriminated union `Result<T, E>` type and helper functions
 * (`ok`, `err`, `isOk`, `isErr`, `unwrap`, `unwrapOr`, `mapResult`, `mapError`)
 * for Rust-style error handling without exceptions.
 *
 * @module core/result
 */

/**
 * @name Result
 * @description Discriminated union representing either a success or failure.
 *
 * - `{ success: true; data: T }`  — Operation succeeded with data.
 * - `{ success: false; error: E }` — Operation failed with an error.
 *
 * @usedBy tool handlers, config pipeline, signer module
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * @name ok
 * @description Creates a success `Result` wrapping the provided data.
 *
 * @param data — The success payload.
 * @returns `{ success: true; data: T }`.
 *
 * @usedBy tool handlers, config pipeline
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * @name err
 * @description Creates a failure `Result` wrapping the provided error.
 *
 * @param error — The error value.
 * @returns `{ success: false; error: E }`.
 *
 * @usedBy tool handlers, config pipeline
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * @name isOk
 * @description Type guard that narrows a `Result` to the success variant.
 *
 * @param result — The `Result` to test.
 * @returns `true` when the result is a success.
 *
 * @usedBy tool handlers, result consumers
 */
export function isOk<T, E>(result: Result<T, E>): result is { success: true; data: T } {
  return result.success;
}

/**
 * @name isErr
 * @description Type guard that narrows a `Result` to the failure variant.
 *
 * @param result — The `Result` to test.
 * @returns `true` when the result is a failure.
 *
 * @usedBy tool handlers, result consumers
 */
export function isErr<T, E>(result: Result<T, E>): result is { success: false; error: E } {
  return !result.success;
}

/**
 * @name unwrap
 * @description Extracts the data from a success `Result` or throws the error.
 *
 * @param result — The `Result` to unwrap.
 * @returns The success data.
 * @throws The error value when the result is a failure.
 *
 * @usedBy tool handlers
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.success) {
    return result.data;
  }
  throw (result as { success: false; error: E }).error;
}

/**
 * @name unwrapOr
 * @description Extracts the data from a success `Result` or returns a default.
 *
 * @param result      — The `Result` to unwrap.
 * @param defaultValue — Fallback value returned when the result is a failure.
 * @returns The success data or the default value.
 *
 * @usedBy tool handlers
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return result.success ? result.data : defaultValue;
}

/**
 * @name mapResult
 * @description Transforms the success data of a `Result` using a mapping function.
 *
 * @param result — The `Result` to map.
 * @param fn     — Mapping function applied to the success data.
 * @returns A new `Result` with the mapped data, or the original error.
 *
 * @usedBy tool handlers
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
 * @name mapError
 * @description Transforms the error of a failed `Result` using a mapping function.
 *
 * @param result — The `Result` to map.
 * @param fn     — Mapping function applied to the error.
 * @returns A new `Result` with the mapped error, or the original success.
 *
 * @usedBy tool handlers
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
