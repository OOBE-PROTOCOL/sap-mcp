#!/usr/bin/env node
/**
 * Private swap: 1 USDC → SOL via MagicBlock
 * Profile: stevee (28VEsvJpLodUaUReU6t2NFD2uWnqydi2vx2AMfa1HCQP)
 *
 * Flow:
 * 1. Get Jupiter quote via MagicBlock swapQuote
 * 2. Build private swap tx via MagicBlock /v1/swap/swap
 * 3. Sign with local keypair
 * 4. Submit to Solana mainnet
 * 5. Confirm + report
 */

import { VersionedTransaction, Keypair, Connection } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const WALLET_PATH = path.join(os.homedir(), '.config/mcp-sap/keypairs/stevee-keypair.json');
const RPC_URL = 'https://api.mainnet-beta.solana.com';
const PAYMENTS_API = 'https://payments.magicblock.app';

const INPUT_MINT  = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC (6 decimals)
const OUTPUT_MINT = 'So11111111111111111111111111111111111111112';  // wSOL (9 decimals)
const AMOUNT      = '1000000'; // 1 USDC = 1_000_000 base units
const SLIPPAGE_BPS = 300;      // 3%

async function main() {
  // Load keypair
  const keypairData = Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8')));
  const payer = Keypair.fromSecretKey(keypairData);
  console.log(`[stevee] Wallet: ${payer.publicKey.toBase58()}`);

  const connection = new Connection(RPC_URL, 'confirmed');
  console.log(`[stevee] SOL balance: ${(await connection.getBalance(payer.publicKey)) / 1e9} SOL`);

  // ── Step 1: Get quote ──────────────────────────────────────────────
  const quoteUrl = `${PAYMENTS_API}/v1/swap/quote?inputMint=${INPUT_MINT}&outputMint=${OUTPUT_MINT}&amount=${AMOUNT}&slippageBps=${SLIPPAGE_BPS}&swapMode=ExactIn`;
  console.log('\n[1/5] Fetching quote...');
  const quoteRes = await fetch(quoteUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  if (!quoteRes.ok) {
    const text = await quoteRes.text();
    throw new Error(`Quote failed (${quoteRes.status}): ${text}`);
  }
  const quote = await quoteRes.json();
  console.log('  Quote received:');
  console.log(`    Input:  1 USDC (${quote.inAmount} base units)`);
  console.log(`    Output: ${quote.outAmount / 1e9} SOL (${quote.outAmount} lamports)`);
  console.log(`    Min out: ${quote.otherAmountThreshold / 1e9} SOL (3% slippage)`);
  console.log(`    Route: ${quote.routePlan.map(r => r.swapInfo.label).join(' → ')}`);
  console.log(`    Price impact: ${quote.priceImpactPct}`);

  // ── Step 2: Build private swap tx ──────────────────────────────────
  console.log('\n[2/5] Building PRIVATE swap tx...');
  const swapRes = await fetch(`${PAYMENTS_API}/v1/swap/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userPublicKey: payer.publicKey.toBase58(),
      quoteResponse: quote,
      visibility: 'private',
      destination: payer.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      minDelayMs: '0',
      maxDelayMs: '60000',
      split: 1
    })
  });
  if (!swapRes.ok) {
    const text = await swapRes.text();
    throw new Error(`Swap build failed (${swapRes.status}): ${text}`);
  }
  const swapData = await swapRes.json();
  console.log('  Swap tx built:');
  console.log(`    Version: ${swapData.version || 'v0'}`);
  console.log(`    SendTo: ${swapData.sendTo || 'base'}`);
  console.log(`    Instructions: ${swapData.instructionCount || '?'}`);
  if (swapData.privateTransfer) {
    console.log(`    Stash ATA: ${swapData.privateTransfer.stashAta || 'N/A'}`);
    console.log(`    Hydra crank: ${swapData.privateTransfer.hydraCrankPda || 'N/A'}`);
    console.log(`    Shuttle ID: ${swapData.privateTransfer.shuttleId || 'N/A'}`);
  }

  const swapTransaction = swapData.swapTransaction;
  if (!swapTransaction) {
    throw new Error('No swapTransaction in response: ' + JSON.stringify(swapData));
  }

  // ── Step 3: Sign ───────────────────────────────────────────────────
  console.log('\n[3/5] Signing transaction...');
  const txBuffer = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuffer);
  tx.sign([payer]);
  console.log('  Signed OK');

  // ── Step 4: Submit ─────────────────────────────────────────────────
  console.log('\n[4/5] Submitting to Solana mainnet...');
  const serialized = tx.serialize();
  const sig = await connection.sendRawTransaction(serialized, { maxRetries: 3, skipPreflight: false });
  console.log(`  Signature: ${sig}`);

  // ── Step 5: Confirm ────────────────────────────────────────────────
  console.log('\n[5/5] Confirming...');
  const confirmed = await connection.confirmTransaction(sig, 'confirmed');
  if (confirmed.value.err) {
    console.error('  ❌ Transaction failed:', confirmed.value.err);
    process.exit(1);
  }
  console.log('  ✅ Confirmed at slot', confirmed.context.slot);

  // Final balance check
  const newSolBalance = await connection.getBalance(payer.publicKey);
  console.log(`\n[done] New SOL balance: ${newSolBalance / 1e9} SOL`);
  console.log(`[done] View on explorer: https://solscan.io/tx/${sig}`);

  // Note about private settlement
  console.log('\n⚠️  PRIVATE SWAP SETTLEMENT:');
  console.log('  Output goes to stash ATA → Hydra escrow → batched delivery.');
  console.log('  Your wallet SOL ATA may not update immediately.');
  console.log('  Use magicblock_privateBalance to check ephemeral balance during settlement.');
}

main().catch(err => {
  console.error('\n❌ FATAL:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});