/**
 * @name sap/sap-errors
 * @description SAP SDK error mapping and type-guarding utilities.
 *
 * @flow
 *   1. `mapSapError` normalizes unknown errors into `SapSdkError` instances.
 *   2. `isSapError` is a type guard for checking if an error is already a `SapSdkError`.
 *
 * @module sap/sap-errors
 */

import { SapSdkError } from '../../core/src/errors.js';

/**
 * @name mapSapError
 * @description Maps unknown SAP SDK errors to user-friendly `SapSdkError` instances.
 *
 * @param error — Unknown error value to normalize.
 * @returns A `SapSdkError` wrapping the original error message.
 *
 * @usedBy Tool error handlers across the SAP MCP runtime.
 */
export function mapSapError(error: unknown): SapSdkError {
  if (error instanceof SapSdkError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new SapSdkError(error.message, error);
  }
  
  return new SapSdkError('Unknown SAP SDK error');
}

/**
 * @name isSapError
 * @description Type guard that checks whether an error is a `SapSdkError`.
 *
 * @param error — Unknown error value to check.
 * @returns `true` if the error is a `SapSdkError`, narrowing the type.
 *
 * @usedBy Tool error handlers across the SAP MCP runtime.
 */
export function isSapError(error: unknown): error is SapSdkError {
  return error instanceof SapSdkError;
}