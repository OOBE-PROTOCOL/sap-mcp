/**
 * @name premium/activation-manager
 * @description Session activation manager for x402/pay.sh receipt binding.
 *
 * After a buyer creates a session plan (status `pending_payment`) and settles
 * the x402/pay.sh challenge on the delivery rail, the activation manager
 * verifies the receipt and transitions the session to `active`.
 *
 * The activation manager is deliberately decoupled from the x402 facilitator:
 * it accepts an opaque `paymentReceipt` string that the caller (HTTP endpoint
 * or MCP tool) has already verified against the x402/pay.sh rail. This keeps
 * the premium layer testable without a live facilitator.
 *
 * @flow
 *   1. Buyer settles x402 challenge → receives `paymentReceipt` string.
 *   2. Buyer calls `POST /premium/activate` or MCP tool `sap_premium_activate_session`.
 *   3. → `activateSession()` verifies the session is in `pending_payment` status.
 *   4. → Transitions session to `active` via `session-manager.activateSession()`.
 *   5. → Returns `PremiumActivationResult` with `unitsQuota` and `activatedAt`.
 *   6. Stream broker / webhook engine check `status=active` before delivering.
 *
 * @module premium/activation-manager
 */

import { activateSession } from './session-manager.js';
import { getPremiumSession } from './session-manager.js';
import type { PremiumActivationRequest, PremiumActivationResult } from './types.js';

/**
 * @name verifyReceiptFormat
 * @description Basic structural validation of a payment receipt string.
 *
 * This does NOT verify the receipt against the x402/pay.sh facilitator — that
 * is the caller's responsibility. It only checks that the receipt is a non-empty
 * string of reasonable length.
 *
 * Special case: the literal string "pending" is accepted but returns a special
 * result telling the caller to provide the actual tx signature after settlement.
 * This prevents agents from wasting a paid call when they don't have the receipt yet.
 *
 * @param receipt - The opaque receipt string from x402/pay.sh settlement.
 * @returns True if the receipt has a valid structural format.
 *
 * @internal
 */
function verifyReceiptFormat(receipt: string): boolean {
  if (typeof receipt !== 'string') return false;
  if (receipt.trim().length < 8) {
    return false;
  }
  if (receipt.length > 2048) return false;
  return true;
}

/**
 * @name RECEIPT_HELP_MESSAGE
 * @description Help message shown when an agent passes "pending" or an invalid
 * receipt. Explains exactly what the receipt should be and how to get it.
 */
const RECEIPT_HELP_MESSAGE =
  'The paymentReceipt must be the actual Solana transaction signature (tx hash) ' +
  'from the x402 facilitator settlement, not "pending" or a placeholder. ' +
  'Flow: 1) sap_premium_session_start creates a pending session (free). ' +
  '2) The x402 challenge is settled via the local bridge (sap_payments_call_paid_tool ' +
  'or direct facilitator payment) — the facilitator returns a tx signature. ' +
  '3) Pass that tx signature as paymentReceipt to this tool. ' +
  'Do NOT pass "pending" — it will always be rejected. ' +
  'If you do not have the tx signature yet, settle the payment first, then retry.';

/**
 * @name activatePremiumSession
 * @description Activate a pending premium session with a payment receipt.
 *
 * Steps:
 *   1. Validate the receipt format (non-empty, reasonable length).
 *   2. Look up the session via `getPremiumSession`.
 *   3. Check the session is in `pending_payment` status.
 *   4. Call `activateSession` to transition to `active`.
 *   5. Return `PremiumActivationResult`.
 *
 * @param request - Activation request with session id and payment receipt.
 * @returns `PremiumActivationResult` with `status=active` on success.
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_activate_session`,
 *   `remote/server.ts` → `POST /premium/activate`
 */
export function activatePremiumSession(request: PremiumActivationRequest): PremiumActivationResult {
  if (!verifyReceiptFormat(request.paymentReceipt)) {
    return {
      sessionId: request.sessionId,
      status: 'pending_payment',
      activatedAt: null,
      receiptBound: false,
      unitsQuota: 0,
      reason: RECEIPT_HELP_MESSAGE,
    };
  }

  const session = getPremiumSession(request.sessionId);
  if (!session) {
    return {
      sessionId: request.sessionId,
      status: 'expired',
      activatedAt: null,
      receiptBound: false,
      unitsQuota: 0,
      reason: 'Session not found. Create a fresh session plan before activation.',
    };
  }

  if (session.status === 'blocked_requires_provider') {
    return {
      sessionId: request.sessionId,
      status: 'blocked_requires_provider',
      activatedAt: null,
      receiptBound: false,
      unitsQuota: 0,
      reason: 'Provider is not ready. Configure provider env vars before activating.',
    };
  }

  if (session.status === 'expired') {
    return {
      sessionId: request.sessionId,
      status: 'expired',
      activatedAt: null,
      receiptBound: false,
      unitsQuota: 0,
      reason: 'Session has expired. Create a fresh session plan.',
    };
  }

  if (session.status === 'active') {
    return {
      sessionId: request.sessionId,
      status: 'active',
      activatedAt: session.createdAt,
      receiptBound: true,
      unitsQuota: session.requestedUnits,
      reason: 'Session is already active.',
    };
  }

  if (session.status === 'closed') {
    return {
      sessionId: request.sessionId,
      status: 'closed',
      activatedAt: null,
      receiptBound: false,
      unitsQuota: 0,
      reason: 'Session has been closed. Create a fresh session plan.',
    };
  }

  // Status is pending_payment — activate.
  const result = activateSession(request.sessionId);
  return result;
}