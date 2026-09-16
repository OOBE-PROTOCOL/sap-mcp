/**
 * @name tools/perpspad/dbc-launch-tool
 * @description Registers `sap_perpspad_launch_dbc` — the DIRECT Meteora DBC
 *   launch builder (Option 2). Replaces PerpsPad's unsignable /api/v1/launch
 *   response with locally-built, co-signed transactions. Feature parity with
 *   the legacy build_launch: same inputs (ticker, name, dev-buy, perp backing
 *   recorded as metadata), plus the escrow split wired in.
 */

import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { logger } from '../../../core/src/logger.js';
import {
  buildDirectDbcLaunch,
  deriveDbcPool,
  METADATA_PROGRAM_ID,
  deriveMintMetadata,
} from './dbc-launch.js';
import { buildInitializeEscrowInstruction, deriveEscrowPda, isValidSolanaAddress } from './perpspad-escrow.js';
import { registerPerpspadPipelineTool, perpspadPipelineOk, perpspadPipelineException } from './perpspad-pipeline.js';

const OOBE_TREASURY = 'BiHdXQqNXTgMrNikZxw4CMnD1z1t6K2tmtwyXgSWSKqR';
const ESCROW_PROGRAM_ID = 'ENpvWhtTtnveMZ3WHpGKHMEYDrPHHc5v6JjjVUWFNYgA';

/** Registers `sap_perpspad_launch_dbc` on the MCP server. */
export function registerDbcLaunchTool(
  server: Parameters<typeof registerPerpspadPipelineTool>[0],
  context: Parameters<typeof registerPerpspadPipelineTool>[1],
): void {
  registerPerpspadPipelineTool(server, context, 'sap_perpspad_launch_dbc', {
    description: 'Build a DIRECT Meteora DBC token launch (no PerpsPad API): generates the mint+config keypairs, co-signs create_config and initialize_virtual_pool with them, and returns three semi-signed transactions (createConfig, initializePool, initializeEscrow) that the user wallet completes by adding its signature. fee_claimer = escrow PDA → trading fees flow to the escrow, which splits 70% agent / 30% OOBE treasury on-chain. Dev-buy is paid by the payer wallet. Sign order: createConfig → initializePool → initializeEscrow. BUILDER tier.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Coin ticker, A-Z 0-9 only (e.g. MOON)' },
        name: { type: 'string', description: 'Coin display name' },
        agentWallet: { type: 'string', description: 'Agent wallet: receives 70% of claimed trading fees; also the leftover-token receiver' },
        payer: { type: 'string', description: 'Transaction payer + pool creator (signs all three txs client-side)' },
        devBuySol: { type: 'number', description: 'Dev-buy in SOL (0.1-5), spent via swap after pool init' },
        latestBlockhash: { type: 'string', description: 'FRESH mainnet blockhash fetched by the CALLER (getLatestBlockhash) — guarantees signability from the client. Required.' },
        imageUrl: { type: 'string', description: 'Optional coin image URL (embedded in the metadata uri)' },
      },
      required: ['ticker', 'name', 'agentWallet', 'payer', 'devBuySol', 'latestBlockhash'],
    },
  }, async (input) => {
    try {
      const ticker = String(input.ticker ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const name = String(input.name ?? '');
      const agentWallet = String(input.agentWallet ?? '');
      const payer = String(input.payer ?? '');
      const devBuySol = typeof input.devBuySol === 'number' ? input.devBuySol : Number.NaN;

      if (ticker.length < 2 || ticker.length > 10) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_ticker: 2-10 A-Z 0-9 characters'));
      }
      if (!name.trim()) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_name: display name is required'));
      }
      if (!isValidSolanaAddress(agentWallet)) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_agentWallet: must be a valid Solana address'));
      }
      if (!isValidSolanaAddress(payer)) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_payer: must be a valid Solana address'));
      }
      if (!(Number.isFinite(devBuySol) && devBuySol >= 0.1 && devBuySol <= 5)) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_devBuySol: must be between 0.1 and 5 SOL'));
      }
      const latestBlockhash = String(input.latestBlockhash ?? '').trim();
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(latestBlockhash)) {
        return perpspadPipelineException('Invalid direct DBC launch input', new Error('invalid_latestBlockhash: fetch a fresh blockhash via getLatestBlockhash and pass it here'));
      }

      const configKeypair = Keypair.generate();
      const mintKeypair = Keypair.generate();
      const { escrowPda, bump } = deriveEscrowPda(mintKeypair.publicKey);

      // Metadata uri: the DBC init_pool stores it in the mint metadata; Steve
      // hosts the JSON (name/symbol/image) at this endpoint.
      const uri = typeof input.imageUrl === 'string' && input.imageUrl.startsWith('http')
        ? input.imageUrl
        : `https://steve.oobeprotocol.ai/api/launchpad/metadata/${mintKeypair.publicKey.toBase58()}`;

      // latestBlockhash comes from the CALLER (fetched client-side moments
      // before signing) — a server-side fetch here produced blockhashes that
      // were stale/invalid on mainnet by the time the client signed.

      const built = buildDirectDbcLaunch({
        configKeypair,
        mintKeypair,
        escrowPda,
        agentWallet: new PublicKey(agentWallet),
        payer: new PublicKey(payer),
        latestBlockhash,
        metadata: { name: name.trim(), symbol: ticker, uri },
      });

      // initialize_escrow instruction (third tx) — the existing helper.
      const initEscrowIx = buildInitializeEscrowInstruction({
        escrowPda,
        tokenMint: mintKeypair.publicKey,
        agentWallet: new PublicKey(agentWallet),
        payer: new PublicKey(payer),
      });
      const escrowTx = new Transaction().add(initEscrowIx);
      escrowTx.recentBlockhash = latestBlockhash;
      escrowTx.feePayer = new PublicKey(payer);
      // NO ephemeral signature needed — the payer is the only signer.

      logger.debug('Direct DBC launch built', {
        ticker,
        configAddress: built.configAddress,
        poolAddress: built.poolAddress,
        escrowPda: escrowPda.toBase58(),
      });

      return perpspadPipelineOk({
        success: true,
        directDbc: true,
        tokenMint: mintKeypair.publicKey.toBase58(),
        configAddress: built.configAddress,
        poolAddress: built.poolAddress,
        escrowPda: escrowPda.toBase58(),
        escrowBump: bump,
        agentWallet,
        payer,
        devBuySol,
        split: { agentBps: 7000, oobeBps: 3000, oobeTreasury: OOBE_TREASURY },
        transactions: {
          createConfig: {
            base64: built.configTxBase64,
            note: 'Co-signed by the config keypair (gateway). The payer wallet adds its signature client-side.',
          },
          initializePool: {
            base64: built.poolTxBase64,
            note: 'Co-signed by the mint keypair (gateway). The payer wallet adds its signature client-side.',
          },
          initializeEscrow: {
            programId: ESCROW_PROGRAM_ID,
            accounts: {
              escrowPda: escrowPda.toBase58(),
              tokenMint: mintKeypair.publicKey.toBase58(),
              agentWallet,
              payer,
              systemProgram: '11111111111111111111111111111111',
            },
            data: [0],
            note: 'Build with buildInitializeEscrowInstruction client-side; sign with the payer wallet.',
          },
        },
        signingOrder: ['createConfig', 'initializePool', 'initializeEscrow'],
        nextStep: `Send createConfig FIRST, then initializePool, then initializeEscrow. The ephemeral signatures are already embedded — the payer wallet (${payer}) only adds its signature to each. After initializeEscrow confirms, the token is live on its curve; trading fees accrue to the escrow PDA (fee_claimer) and split 70/30 on claim.`,
        _note: 'Semi-signed transactions only — never broadcasts. The ephemeral keypairs control nothing of value and are discarded.',
      });
    } catch (err) {
      return perpspadPipelineException('Failed to build direct DBC launch', err);
    }
  });
}

// Registry-derivation helpers re-exported for the metadata endpoint + tests.
export { deriveDbcPool, deriveMintMetadata, METADATA_PROGRAM_ID };