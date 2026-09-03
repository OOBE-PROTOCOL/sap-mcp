/**
 * @name perps/phoenix/phoenix-builder-onboarding
 * @description Trader onboarding builders for Phoenix perps.
 *
 * Registration and activation are two different on-chain steps:
 *  - `RegisterTrader` creates the trader PDA — the account stays FROZEN with
 *    no capabilities (flags=6: CAN_PLACE_LIMIT | CAN_PLACE_MARKET only).
 *  - `OnboardTraderDelegated` enables ALL six capabilities (limit, market,
 *    risk-increasing, risk-reducing, deposit, withdraw) — but its required
 *    signer is Phoenix's own onboarder key, which only exists through
 *    Phoenix's API co-signing flow:
 *      POST /v1/exchange/build-register-ixs  (returns onboarder-signed ixs)
 *      POST /v1/exchange/send-register-ixs   (Phoenix co-signs + submits)
 *
 * A user-signed RegisterTrader-only transaction therefore simulates
 * CapabilityDenied forever. These tools implement the documented
 * build → user-sign → Phoenix-co-signed-submit flow.
 *
 * All builders produce unsigned instruction data — NO signing happens
 * server-side. The user's authority signs in their browser; Phoenix's
 * onboarder signs inside send-register-ixs only.
 *
 * @module perps/phoenix/phoenix-builder-onboarding
 */

import { PHOENIX_DATA_API_BASE_URL } from './phoenix-constants.js';
import { logger } from '../../../core/src/logger.js';

/** One wire instruction from build-register-ixs (pubkey/keys/data shape). */
export interface PhoenixApiInstruction {
  readonly programId: string;
  readonly keys: ReadonlyArray<{
    readonly pubkey: string;
    readonly isSigner: boolean;
    readonly isWritable: boolean;
  }>;
  readonly data: ReadonlyArray<number>;
}

export interface BuildOnboardInstructionsResult {
  /** Wire instructions for the browser to assemble, sign, and submit. */
  readonly instructions: readonly PhoenixApiInstruction[];
  /** Trader PDA that will be activated. */
  readonly traderPda: string;
  /** Phoenix onboarder key that co-signs inside send-register-ixs. */
  readonly traderOnboarder: string;
  /** Echoed fee payer. */
  readonly txFeePayer: string;
  /** maxPositions used for the registration (32-128). */
  readonly maxPositions: number;
  /** True when RegisterTrader must be included (account not yet created). */
  readonly includeRegisterTrader: boolean;
  /** The instructions are NOT RPC-submittable alone — Phoenix must co-sign. */
  readonly requiresPhoenixApiSubmit: true;
  readonly nextTool: 'sap_phoenix_submit_onboard_trader';
  /** Safe state machine gates for client UIs. */
  readonly safeToApprove: true;
  readonly approvalBlocked: false;
  /** Human-readable next step for agents and UIs. */
  readonly instructions_note: string;
}

export interface SubmitOnboardResult {
  readonly success: true;
  readonly signature: string;
  readonly traderPda: string;
  /** True when RegisterTrader was included in the submitted transaction. */
  readonly includeRegisterTrader: boolean;
  /** Post-submit verification hint: re-check trader state for active flags. */
  readonly verification: string;
}

function validateBase58PublicKey(value: unknown, field: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') {
    throw new Error(`${field} is required. Pass the FULL base58 wallet address (44 chars, no dots).`);
  }
  if (trimmed.includes('...') || trimmed.includes('…')) {
    throw new Error(`${field} is abbreviated ("${trimmed}"). Pass the FULL base58 address (44 chars, no dots).`);
  }
  if (trimmed.length < 32 || trimmed.length > 44) {
    throw new Error(`${field} length ${trimmed.length} is outside the valid range (32-44). Pass the FULL base58 address.`);
  }
  return trimmed;
}

/**
 * Build delegated-onboarding instructions for a trader account.
 * Calls Phoenix's POST /v1/exchange/build-register-ixs — the only endpoint
 * that returns the OnboardTraderDelegated instruction set.
 *
 * @param params.traderAuthority — Trader authority wallet (base58).
 * @param params.txFeePayer — Wallet paying fees and rent (base58). Must NOT be the Phoenix onboarder.
 * @param params.maxPositions — Optional; defaults to 128 (min 32).
 */
export async function buildOnboardInstructions(params: {
  traderAuthority: string;
  txFeePayer: string;
  maxPositions?: number;
}): Promise<BuildOnboardInstructionsResult> {
  const traderAuthority = validateBase58PublicKey(params.traderAuthority, 'traderAuthority');
  const txFeePayer = validateBase58PublicKey(params.txFeePayer, 'txFeePayer');

  if (params.maxPositions !== undefined) {
    const max = Number(params.maxPositions);
    if (!Number.isFinite(max) || !Number.isInteger(max) || max < 32 || max > 128) {
      throw new Error('maxPositions must be an integer between 32 and 128.');
    }
  }

  const body = {
    traderAuthority,
    txFeePayer,
    ...(params.maxPositions !== undefined ? { maxPositions: Number(params.maxPositions) } : {}),
  };
  logger.debug('Phoenix onboard builder — build-register-ixs', { traderAuthority, txFeePayer });

  const response = await fetch(`${PHOENIX_DATA_API_BASE_URL}/v1/exchange/build-register-ixs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Phoenix build-register-ixs failed: ${response.status} ${errorText}`);
  }
  const data = await response.json() as {
    instructions: PhoenixApiInstruction[];
    traderPda: string;
    traderOnboarder: string;
    txFeePayer: string;
    maxPositions: number;
    includeRegisterTrader: boolean;
  };

  return {
    instructions: data.instructions,
    traderPda: data.traderPda,
    traderOnboarder: data.traderOnboarder,
    txFeePayer: data.txFeePayer,
    maxPositions: data.maxPositions,
    includeRegisterTrader: data.includeRegisterTrader === true,
    requiresPhoenixApiSubmit: true,
    nextTool: 'sap_phoenix_submit_onboard_trader',
    safeToApprove: true,
    approvalBlocked: false,
    instructions_note: data.includeRegisterTrader
      ? 'Assemble these instructions into one transaction, sign with the fee payer (and trader authority if it is a signer), then submit with sap_phoenix_submit_onboard_trader — Phoenix co-signs with the onboarder. Do NOT submit via a plain RPC endpoint: without the onboarder signature the trader stays frozen with no deposit capability.'
      : 'The trader account already exists — these instructions onboard it (enable all six capabilities). Sign with the fee payer, then submit with sap_phoenix_submit_onboard_trader. Never submit via plain RPC: the onboarder signature is added by Phoenix inside send-register-ixs.',
  };
}

/**
 * Submit a user-signed onboarding transaction to Phoenix's co-signing API.
 * Phoenix validates it, adds the onboarder signature, simulates, verifies
 * the onboarder pays nothing, and broadcasts. Returns the signature.
 *
 * @param params.transaction — Base64-encoded fully assembled transaction,
 *        signed by the fee payer (authority signature not required).
 * @param params.traderAuthority — Same authority used in buildOnboardInstructions.
 * @param params.txFeePayer — Same fee payer used in buildOnboardInstructions.
 */
export async function submitOnboardTransaction(params: {
  transaction: string;
  traderAuthority: string;
  txFeePayer: string;
}): Promise<SubmitOnboardResult> {
  const traderAuthority = validateBase58PublicKey(params.traderAuthority, 'traderAuthority');
  const txFeePayer = validateBase58PublicKey(params.txFeePayer, 'txFeePayer');
  const transaction = typeof params.transaction === 'string' ? params.transaction.trim() : '';
  if (!transaction) {
    throw new Error('transaction is required. Pass the base64-encoded transaction signed by the fee payer.');
  }
  if (transaction.includes('...') || transaction.includes('…')) {
    throw new Error('transaction looks truncated. Pass the FULL base64-encoded signed transaction.');
  }

  logger.debug('Phoenix onboard submit — send-register-ixs', { traderAuthority, txFeePayer });
  const response = await fetch(`${PHOENIX_DATA_API_BASE_URL}/v1/exchange/send-register-ixs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transaction,
      traderAuthority,
      txFeePayer,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Phoenix send-register-ixs failed: ${response.status} ${errorText}`);
  }
  const data = await response.json() as { signature?: string; traderPda?: string; includeRegisterTrader?: boolean };
  if (!data.signature) {
    throw new Error('Phoenix send-register-ixs returned no signature.');
  }

  return {
    success: true,
    signature: data.signature,
    traderPda: data.traderPda ?? '',
    includeRegisterTrader: data.includeRegisterTrader === true,
    verification: 'Trader activation submitted. Re-check sap_phoenix_get_trader_state in ~5-10s: state should leave "frozen" and depositCollateral should become immediate. Then build deposits normally with sap_phoenix_build_deposit.',
  };
}