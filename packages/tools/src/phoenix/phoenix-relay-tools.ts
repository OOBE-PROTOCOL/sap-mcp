/**
 * @name tools/phoenix/phoenix-relay-tools
 * @description MCP tools for cross-chain deposits via Relay.link to Solana.
 *
 * Three read-only tools that enable users to bridge funds from any EVM chain
 * (Ethereum, Base, Arbitrum, etc.) to Solana USDC using Relay deposit addresses.
 * The user sends funds to a deposit address and receives USDC on Solana automatically.
 *
 * Execution class: hosted-safe-read (all tools are read-only API calls, no signing).
 *
 * @module tools/phoenix/phoenix-relay-tools
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { SapMcpContext } from '../../../core/src/types.js';
import { logger } from '../../../core/src/logger.js';
import type { JsonSchema } from './phoenix-helpers.js';
import {
  registerPhoenixPipelineTool,
  phoenixPipelineOk,
  phoenixPipelineException,
} from './phoenix-pipeline.js';
import {
  getCrossChainQuote,
  getDepositStatus,
  getSupportedChains,
  RELAY_EVM_CHAIN_IDS,
  RELAY_EVM_NATIVE_ADDRESS,
  RELAY_EVM_USDC_ADDRESSES,
} from '../../../perps/src/phoenix/phoenix-relay-api.js';

export function registerPhoenixRelayTools(server: Server, context: SapMcpContext): void {
  logger.debug('Registering Phoenix Relay cross-chain deposit tools');

  /* ════════════════════════════════════════════════════════════════════
   *  get_cross_chain_quote — generate a deposit address for bridging to Solana USDC
   * ════════════════════════════════════════════════════════════════════ */
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_cross_chain_quote', {
    description: 'Get a cross-chain deposit quote from Relay.link. Generates a deposit address that the user sends funds to (from Ethereum, Base, Arbitrum, or any supported EVM chain) and receives USDC on Solana automatically. The user just sends a normal transfer to the deposit address — no wallet connection or bridge UI needed. Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient: {
          type: 'string',
          description: 'Solana wallet address (base58) that will receive the USDC. This is the user\'s wallet on Solana.',
        },
        originChainId: {
          type: 'number',
          description: 'Origin chain ID. Supported: 1 (Ethereum), 10 (Optimism), 8453 (Base), 42161 (Arbitrum), 137 (Polygon), 56 (BSC), 43114 (Avalanche). Default: 1 (Ethereum).',
          enum: [1, 10, 56, 137, 42161, 8453, 43114, 81457, 534352, 59144],
          default: 1,
        },
        originCurrency: {
          type: 'string',
          description: 'Origin token address. Use 0x0000000000000000000000000000000000000000 for native ETH/gas token, or the ERC20 contract address (e.g. USDC). Default: native (0x000...000).',
          default: '0x0000000000000000000000000000000000000000',
        },
        amount: {
          type: 'string',
          description: 'Amount in smallest unit (wei for ETH, or raw token units for ERC20). Example: 100000000000000000 = 0.1 ETH. Required.',
        },
        tradeType: {
          type: 'string',
          enum: ['EXACT_INPUT', 'EXPECTED_OUTPUT'],
          description: 'EXACT_INPUT = amount is what you send. EXPECTED_OUTPUT = amount is what you want to receive. Default: EXACT_INPUT.',
        },
      },
      required: ['recipient', 'originChainId', 'amount'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const recipient = String(input.recipient ?? '').trim();
      if (!recipient || recipient.length < 32) {
        return phoenixPipelineException('recipient is required and must be a full Solana wallet address (base58)', new Error('Invalid recipient'));
      }
      const originChainId = typeof input.originChainId === 'number' ? input.originChainId : 1;
      const originCurrency = String(input.originCurrency ?? RELAY_EVM_NATIVE_ADDRESS).trim();
      const amount = String(input.amount ?? '').trim();
      if (!amount) {
        return phoenixPipelineException('amount is required (in smallest unit, e.g. wei for ETH)', new Error('Missing amount'));
      }

      const quote = await getCrossChainQuote({
        recipient,
        originChainId,
        originCurrency,
        amount,
        tradeType: input.tradeType as 'EXACT_INPUT' | 'EXPECTED_OUTPUT' | undefined,
      });

      return phoenixPipelineOk({
        depositAddress: quote.depositAddress,
        requestId: quote.requestId,
        fees: quote.fees,
        details: quote.details,
        instructions: `Send ${amount} units of the origin currency to the deposit address ${quote.depositAddress} on chain ${originChainId}. Relay will detect the deposit and deliver USDC to ${recipient} on Solana. Track the status with sap_phoenix_get_deposit_status using the requestId.`,
        supportedEvmChains: Object.entries(RELAY_EVM_CHAIN_IDS).map(([name, id]) => ({ name, chainId: id })),
      });
    } catch (err) {
      return phoenixPipelineException('Failed to get cross-chain deposit quote', err);
    }
  });

  /* ════════════════════════════════════════════════════════════════════
   *  get_deposit_status — track a cross-chain deposit
   * ════════════════════════════════════════════════════════════════════ */
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_deposit_status', {
    description: 'Check the status of a cross-chain deposit via Relay.link. Returns the current status (pending/success/failed/refunded), transaction hashes, and chain IDs. Use the requestId from sap_phoenix_get_cross_chain_quote. Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: {
          type: 'string',
          description: 'Request ID from the cross-chain quote response. Required.',
        },
      },
      required: ['requestId'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const requestId = String(input.requestId ?? '').trim();
      if (!requestId) {
        return phoenixPipelineException('requestId is required', new Error('Missing requestId'));
      }

      const status = await getDepositStatus(requestId);

      return phoenixPipelineOk({
        status: status.status,
        inTxHashes: status.inTxHashes,
        txHashes: status.txHashes,
        updatedAt: status.updatedAt,
        originChainId: status.originChainId,
        destinationChainId: status.destinationChainId,
        note: status.status === 'success'
          ? 'Deposit completed — USDC has been delivered to the Solana wallet.'
          : status.status === 'pending'
            ? 'Deposit is in progress — Relay is detecting and processing the transfer.'
            : status.status === 'failed'
              ? 'Deposit failed — funds will be refunded to the origin address.'
              : `Deposit status: ${status.status}`,
      });
    } catch (err) {
      return phoenixPipelineException('Failed to check deposit status', err);
    }
  });

  /* ════════════════════════════════════════════════════════════════════
   *  get_supported_chains — list all deposit-enabled chains
   * ════════════════════════════════════════════════════════════════════ */
  registerPhoenixPipelineTool(server, context, 'sap_phoenix_get_supported_chains', {
    description: 'List all chains supported by Relay.link for cross-chain deposits to Solana. Returns chain IDs, names, and native currency info. Use this to show users which chains they can deposit from. Free read.',
    inputSchema: {
      type: 'object',
      properties: {},
    } as unknown as JsonSchema,
  }, async () => {
    try {
      const chains = await getSupportedChains();

      return phoenixPipelineOk({
        totalChains: chains.length,
        chains: chains.map((c) => ({
          chainId: c.id,
          name: c.name,
          displayName: c.displayName,
          nativeCurrency: c.currency.symbol,
          nativeCurrencyAddress: c.currency.address,
        })),
        popularChains: [
          { name: 'Ethereum', chainId: 1, usdcAddress: RELAY_EVM_USDC_ADDRESSES[1] },
          { name: 'Base', chainId: 8453, usdcAddress: RELAY_EVM_USDC_ADDRESSES[8453] },
          { name: 'Arbitrum', chainId: 42161, usdcAddress: RELAY_EVM_USDC_ADDRESSES[42161] },
          { name: 'Optimism', chainId: 10, usdcAddress: RELAY_EVM_USDC_ADDRESSES[10] },
          { name: 'Polygon', chainId: 137, usdcAddress: RELAY_EVM_USDC_ADDRESSES[137] },
        ],
        destinationChain: { name: 'Solana', chainId: 792703809, currency: 'USDC' },
        note: 'Send funds from any of these chains to a Relay deposit address and receive USDC on Solana automatically.',
      });
    } catch (err) {
      return phoenixPipelineException('Failed to fetch supported chains', err);
    }
  });

  /* ════════════════════════════════════════════════════════════════════
   *  Jupiter Universal Deposit — standalone Jupiter-branded tools
   *  Same Relay.link API, but with jupiter_ prefix for skill routing
   * ════════════════════════════════════════════════════════════════════ */
  registerPhoenixPipelineTool(server, context, 'jupiter_universal_deposit_quote', {
    description: 'Jupiter Universal Deposit: generate a deposit address to bridge funds from any EVM chain (Ethereum, Base, Arbitrum, etc.) to Solana USDC. Powered by Relay.link — same infrastructure as jup.ag/deposit. The user sends a normal transfer to the deposit address and receives USDC on Solana automatically. Flat $0.30 fee. Free read.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient: { type: 'string', description: 'Solana wallet address (base58) that will receive USDC.' },
        originChainId: { type: 'number', description: 'Origin chain ID: 1 (Ethereum), 8453 (Base), 42161 (Arbitrum), 10 (Optimism), 137 (Polygon), 56 (BSC).', enum: [1, 10, 56, 137, 42161, 8453, 43114] },
        originCurrency: { type: 'string', description: 'Origin token address. 0x0000000000000000000000000000000000000000 for native ETH. Default: native.', default: '0x0000000000000000000000000000000000000000' },
        amount: { type: 'string', description: 'Amount in smallest unit (wei for ETH). Required.' },
      },
      required: ['recipient', 'originChainId', 'amount'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const recipient = String(input.recipient ?? '').trim();
      if (!recipient || recipient.length < 32) {
        return phoenixPipelineException('recipient is required and must be a full Solana wallet address', new Error('Invalid recipient'));
      }
      const originChainId = typeof input.originChainId === 'number' ? input.originChainId : 1;
      const originCurrency = String(input.originCurrency ?? RELAY_EVM_NATIVE_ADDRESS).trim();
      const amount = String(input.amount ?? '').trim();
      if (!amount) {
        return phoenixPipelineException('amount is required', new Error('Missing amount'));
      }

      const quote = await getCrossChainQuote({ recipient, originChainId, originCurrency, amount });
      return phoenixPipelineOk({
        depositAddress: quote.depositAddress,
        requestId: quote.requestId,
        fees: quote.fees,
        details: quote.details,
        instructions: `Send ${amount} units to ${quote.depositAddress} on chain ${originChainId}. USDC will arrive at ${recipient} on Solana. Track with jupiter_universal_deposit_status.`,
      });
    } catch (err) {
      return phoenixPipelineException('Failed to get Jupiter Universal Deposit quote', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'jupiter_universal_deposit_status', {
    description: 'Track a Jupiter Universal Deposit cross-chain transfer. Returns status (pending/success/failed), transaction hashes. Use requestId from jupiter_universal_deposit_quote. Free read.',
    inputSchema: {
      type: 'object',
      properties: { requestId: { type: 'string', description: 'Request ID from the deposit quote.' } },
      required: ['requestId'],
    } as unknown as JsonSchema,
  }, async (input) => {
    try {
      const requestId = String(input.requestId ?? '').trim();
      if (!requestId) return phoenixPipelineException('requestId is required', new Error('Missing requestId'));
      const status = await getDepositStatus(requestId);
      return phoenixPipelineOk(status);
    } catch (err) {
      return phoenixPipelineException('Failed to check deposit status', err);
    }
  });

  registerPhoenixPipelineTool(server, context, 'jupiter_universal_deposit_chains', {
    description: 'List all chains supported by Jupiter Universal Deposit for cross-chain transfers to Solana. Returns chain IDs, names, and popular chains. Free read.',
    inputSchema: { type: 'object', properties: {} } as unknown as JsonSchema,
  }, async () => {
    try {
      const chains = await getSupportedChains();
      return phoenixPipelineOk({
        totalChains: chains.length,
        popularChains: [
          { name: 'Ethereum', chainId: 1 },
          { name: 'Base', chainId: 8453 },
          { name: 'Arbitrum', chainId: 42161 },
          { name: 'Optimism', chainId: 10 },
          { name: 'Polygon', chainId: 137 },
        ],
        destinationChain: { name: 'Solana', chainId: 792703809, currency: 'USDC' },
      });
    } catch (err) {
      return phoenixPipelineException('Failed to fetch supported chains', err);
    }
  });

  logger.debug('Phoenix Relay + Jupiter Universal Deposit tools registered', { count: 6 });
}