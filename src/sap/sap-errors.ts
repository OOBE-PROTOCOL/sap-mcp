/**
 * SAP-specific error handling
 */

import { SapSdkError } from '../core/errors.js';

/**
 * Map SAP SDK errors to user-friendly messages
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
 * Check if error is a SAP SDK error
 */
export function isSapError(error: unknown): error is SapSdkError {
  return error instanceof SapSdkError;
}
