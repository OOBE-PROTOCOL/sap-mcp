/**
 * @name tools/phoenix/phoenix-collateral-tools
 * @description Phoenix perps collateral builder tools (deposit, withdraw, register trader).
 *
 * All builders return unsigned serialized transactions — NO signing server-side.
 *
 * @module tools/phoenix/phoenix-collateral-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import { logger } from '../../../core/src/logger.js';
import { getConnection, parsePublicKey, validateAuthority } from './phoenix-helpers.js';
import { createToolExecutionResult } from '../tool-execution-pipeline.js';
import type { JsonSchema } from './phoenix-helpers.js';
import {
  registerPhoenixPipelineTool,
  phoenixPipelineOk,
  phoenixPipelineException,
} from './phoenix-pipeline.js';
import {
  buildDeposit,
  buildWithdraw,
  buildRegisterTrader,
} from '../../../perps/src/phoenix/phoenix-builder-collateral.js';
import {
  buildOnboardInstructions,
  submitOnboardTransaction,
} from '../../../perps/src/phoenix/phoenix-builder-onboarding.js';

export function registerPhoenixCollateralTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering Phoenix collateral builder tools');

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_deposit', {
    description: 'Build an unsigned USDC deposit transaction into a Phoenix trader account. Returns transactionBase64 for browser approval. Requires an ACTIVATED trader: check sap_phoenix_get_trader_state first — if state is "frozen" or depositCollateral.immediate=false, run the activation flow (sap_phoenix_build_onboard_trader → sign → sap_phoenix_submit_onboard_trader) before depositing, or this build simulates CapabilityDenied.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key (base58)' },
        amountUsdc: { type: 'string', description: 'Amount in raw USDC units (1 USDC = 1000000)' },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'amountUsdc'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authorityStr = validateAuthority(input);
      if (!authorityStr) return createToolExecutionResult({ error: 'authority is required. Pass the trader\'s wallet public key (base58).' } as Record<string, unknown>, undefined, { isError: true });
      const authority = parsePublicKey(authorityStr);
      const result = await buildDeposit(
        connection, authority, authority,
        BigInt(input.amountUsdc as string),
        (input.traderPdaIndex as number) ?? 0,
        (input.traderSubaccountIndex as number) ?? 0,
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix deposit', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_withdraw', {
    description: 'Build an unsigned USDC withdraw transaction from a Phoenix trader account. Returns transactionBase64.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader authority public key' },
        amountUsdc: { type: 'string', description: 'Amount in raw USDC units' },
        traderPdaIndex: { type: 'number', minimum: 0 },
        traderSubaccountIndex: { type: 'number', minimum: 0 },
      },
      required: ['authority', 'amountUsdc'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const connection = getConnection(context);
      const authorityStr = validateAuthority(input);
      if (!authorityStr) return createToolExecutionResult({ error: 'authority is required. Pass the trader\'s wallet public key (base58).' } as Record<string, unknown>, undefined, { isError: true });
      const authority = parsePublicKey(authorityStr);
      const result = await buildWithdraw(
        connection, authority, authority,
        BigInt(input.amountUsdc as string),
        (input.traderPdaIndex as number) ?? 0,
        (input.traderSubaccountIndex as number) ?? 0,
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix withdraw', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_register_trader', {
    description: 'Create a Phoenix trader account (RegisterTrader only — the account stays FROZEN with NO deposit capability until activation). Full onboarding = registration + activation: 1) sap_phoenix_build_register_trader → preview/sign/submit locally (creates the account); 2) sap_phoenix_build_onboard_trader + sap_phoenix_submit_onboard_trader (Phoenix co-signs, enables deposit/withdraw/trade); 3) verify with sap_phoenix_get_trader_state — state must leave "frozen" and depositCollateral must be immediate before sap_phoenix_build_deposit can succeed.',
    inputSchema: {
      type: 'object',
      properties: {
        authority: { type: 'string', description: 'Trader wallet authority public key (base58). REQUIRED — pass the user\'s wallet address.' },
        maxPositions: { type: 'number', description: 'Maximum positions (default 8)', minimum: 1, maximum: 64 },
      },
      required: ['authority'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const authorityStr = validateAuthority({ authority: input.authority });
      if (!authorityStr) {
        return createToolExecutionResult({ error: 'authority parameter is required. Pass the FULL wallet public key (base58, 44 chars, no dots). Do NOT use abbreviated addresses like 4emrGb...XVYD - get the exact address from steve_get_wallet_balance.' } as Record<string, unknown>, undefined, { isError: true });
      }
      const connection = getConnection(context);
      const authority = parsePublicKey(authorityStr);
      const result = await buildRegisterTrader(
        connection, authority, authority,
        (input.maxPositions as number) ?? 8,
      );
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix register trader', err);
    }
  });

  /* ════════════════════════════════════════════════════════════════════
   *  Trader ACTIVATION (delegated onboarding)
   *
   *  RegisterTrader alone leaves the account frozen with no capabilities.
   *  Activation requires Phoenix's onboarder co-signature, which only
   *  exists through the build-register-ixs → send-register-ixs API flow.
   * ════════════════════════════════════════════════════════════════════ */

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_build_onboard_trader', {
    description: 'Build Phoenix trader ACTIVATION instructions (enables all six capabilities incl. deposit). ALWAYS required after register — a RegisterTrader-only account is frozen and every deposit simulates CapabilityDenied. Fetches instructions from Phoenix\'s build-register-ixs API (the only source of the OnboardTraderDelegated instruction). The browser assembles and signs them, then MUST submit via sap_phoenix_submit_onboard_trader — never via plain RPC, the onboarder signature exists only inside Phoenix\'s send-register-ixs.',
    inputSchema: {
      type: 'object',
      properties: {
        traderAuthority: { type: 'string', description: 'Trader authority wallet public key (base58, FULL 44 chars).' },
        txFeePayer: { type: 'string', description: 'Wallet paying fees and rent (base58). Usually the same as traderAuthority. Must NOT be the Phoenix onboarder.' },
        maxPositions: { type: 'number', description: 'Max positions for registration (32-128, default 128). Only used when the account still needs RegisterTrader.', minimum: 32, maximum: 128 },
      },
      required: ['traderAuthority', 'txFeePayer'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const result = await buildOnboardInstructions({
        traderAuthority: String(input.traderAuthority ?? ''),
        txFeePayer: String(input.txFeePayer ?? input.traderAuthority ?? ''),
        maxPositions: input.maxPositions as number | undefined,
      });
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to build Phoenix trader onboarding', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'sap_phoenix_submit_onboard_trader', {
    description: 'Submit a user-signed Phoenix activation transaction through Phoenix\'s co-signing API (send-register-ixs): Phoenix validates it, adds the onboarder signature, simulates, verifies the onboarder pays nothing, and broadcasts. Pair with sap_phoenix_build_onboard_trader. After success verify with sap_phoenix_get_trader_state (state leaves "frozen", depositCollateral.immediate=true) before building deposits.',
    inputSchema: {
      type: 'object',
      properties: {
        transaction: { type: 'string', description: 'Base64-encoded transaction assembled from build_onboard_trader instructions and signed by the fee payer.' },
        traderAuthority: { type: 'string', description: 'Trader authority wallet public key (base58) — same as used in build_onboard_trader.' },
        txFeePayer: { type: 'string', description: 'Fee payer wallet public key (base58) — same as used in build_onboard_trader.' },
      },
      required: ['transaction', 'traderAuthority', 'txFeePayer'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const result = await submitOnboardTransaction({
        transaction: String(input.transaction ?? ''),
        traderAuthority: String(input.traderAuthority ?? ''),
        txFeePayer: String(input.txFeePayer ?? input.traderAuthority ?? ''),
      });
      return phoenixPipelineOk(result);
    } catch (err) {
      return phoenixPipelineException('Failed to submit Phoenix trader onboarding', err);
    }
  });

  logger.debug('Phoenix collateral builder tools registered', { count: 5 });
}