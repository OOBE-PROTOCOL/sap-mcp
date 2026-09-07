/**
 * @name premium/activation-manager
 * @description Session activation manager for x402/pay.sh receipt binding.
 *
 * After a buyer creates a session plan (status `pending_payment`) and settles
 * the x402/pay.sh challenge on the delivery rail, the activation manager
 * verifies the receipt and transitions the session to `active`.
 *
 * Solking disclosure 2026-09-07 (Finding 2): activation previously only
 * length-checked the receipt string, so any 8-character placeholder activated
 * a paid premium session. Activation now REQUIRES an injected
 * {@link ReceiptVerifier} and FAILS CLOSED when none is configured — the only
 * bypass is the explicit dev escape hatch `SAP_MCP_ALLOW_UNVERIFIED_ACTIVATION=true`,
 * which must never be set on hosted deployments.
 *
 * @flow
 *   1. Buyer settles x402 challenge → receives `paymentReceipt` (tx signature).
 *   2. Buyer calls `POST /premium/activate` or MCP tool `sap_premium_activate_session`.
 *   3. → Receipt format is validated, then the injected `ReceiptVerifier`
 *      checks the settlement on-chain (or against the facilitator).
 *   4. → On success, `session-manager.activateSession()` transitions to `active`.
 *   5. → Returns `PremiumActivationResult` with `unitsQuota` and `activatedAt`.
 *   6. Stream broker / webhook engine check `status=active` before delivering.
 *
 * @module premium/activation-manager
 */

import { activateSession } from './session-manager.js';
import { getPremiumSession } from './session-manager.js';
import type { PremiumActivationRequest, PremiumActivationResult } from './types.js';

/**
 * @name ReceiptVerifier
 * @description Asynchronous payment-receipt verification contract.
 *
 * Implementations check that `receipt` is a real settled payment (on-chain tx
 * signature lookup against the recorded payTo/price, or a facilitator verify
 * call). Injected by the HTTP route / MCP tool layer; the premium package
 * itself stays network-free for testability.
 */
export interface ReceiptVerifier {
  verify(receipt: string, expectedAmountUsd?: number): Promise<{ valid: boolean; payer?: string; reason?: string }>;
}

/**
 * @name verifyReceiptFormat
 * @description Basic structural validation of a payment receipt string.
 *
 * This does NOT verify the receipt against the x402/pay.sh facilitator — that
 * is the ReceiptVerifier's job. It only checks that the receipt is a non-empty
 * string of reasonable length, as a cheap pre-filter before the (costlier)
 * verification call.
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

function rejected(sessionId: string, reason: string): PremiumActivationResult {
  return {
    sessionId,
    status: 'rejected',
    activatedAt: null,
    receiptBound: false,
    unitsQuota: 0,
    reason,
  };
}

/**
 * @name activatePremiumSession
 * @description Activate a pending premium session with a verified payment receipt.
 *
 * Steps:
 *   1. Validate the receipt format (non-empty, reasonable length).
 *   2. Look up the session via `getPremiumSession`.
 *   3. Check the session is in `pending_payment` status.
 *   4. Verify the receipt via the injected `ReceiptVerifier` — fail closed
 *      when no verifier is configured unless the dev escape hatch is set.
 *   5. Call `activateSession` to transition to `active`.
 *   6. Return `PremiumActivationResult`.
 *
 * @param request - Activation request with session id, payment receipt, and
 *   optional receipt verifier.
 * @returns `PremiumActivationResult` with `status=active` on success,
 *   `status=rejected` when verification fails or is unavailable.
 *
 * @usedBy `premium-tools.ts` → MCP tool `sap_premium_activate_session`,
 *   `remote/server.ts` → `POST /premium/activate`
 */
export async function activatePremiumSession(request: PremiumActivationRequest): Promise<PremiumActivationResult> {
  if (!verifyReceiptFormat(request.paymentReceipt)) {
    return rejected(request.sessionId, RECEIPT_HELP_MESSAGE);
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

  // Status is pending_payment — verify the receipt BEFORE activating.
  // Finding 2: fail closed without a verifier; the escape hatch is an explicit,
  // logged dev-only option that must never be enabled on hosted deployments.
  if (!request.receiptVerifier) {
    if (process.env['SAP_MCP_ALLOW_UNVERIFIED_ACTIVATION'] === 'true') {
      console.error(
        '[activation-manager] SAP_MCP_ALLOW_UNVERIFIED_ACTIVATION=true — activating session WITHOUT receipt verification. ' +
        'This is a development escape hatch and MUST NOT be enabled on hosted deployments.',
      );
      return activateSession(request.sessionId);
    }
    return rejected(
      request.sessionId,
      'receipt_verification_unavailable: no receipt verifier is configured. ' +
      'Activation requires proof of settlement. (Hosted deployments must wire a facilitator or on-chain verifier.)',
    );
  }

  let verification: { valid: boolean; payer?: string; reason?: string };
  try {
    verification = await request.receiptVerifier.verify(request.paymentReceipt, session.estimatedPriceUsd);
  } catch (error) {
    return rejected(
      request.sessionId,
      `receipt_verification_error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!verification.valid) {
    return rejected(
      request.sessionId,
      `receipt_verification_failed: ${verification.reason ?? 'the payment receipt could not be verified on-chain'}. ${RECEIPT_HELP_MESSAGE}`,
    );
  }

  return activateSession(request.sessionId);
}