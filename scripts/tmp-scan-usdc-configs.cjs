/* Scan Meteora DBC configs by quote mint; decode PoolConfig fields. */
const { PublicKey, Connection } = require('@solana/web3.js');

const DBC = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL = 'So11111111111111111111111111111111111111112';

// Account (PoolConfig, zero_copy) offsets AFTER the 8-byte Anchor discriminator:
// quote_mint 0..32 | fee_claimer 32 | leftover 64 | pool_fees 96..176
//   (base_fee: cliff 0, second_factor 8, third_factor 16, first_factor 24 u16, mode 26)
// migration_quote_threshold 256 (u64) | migration_base_threshold 264 | migration_sqrt_price 272 (u128)
// locked_vesting 288..336 | pre 336 | post 344 | misc 352..360 | pool_creation_fee 360
// migrated_pool_base_fee_bytes 368..384 | sqrt_start_price 384 (u128) | curve 400..
const O = 8; // discriminator
async function main() {
  const rpc = process.argv[2];
  const quote = process.argv[3] || USDC;
  const conn = new Connection(rpc, 'confirmed');
  const quoteBytes = new PublicKey(quote).toBuffer();
  const res = await conn.getParsedProgramAccounts(new PublicKey(DBC), {
    filters: [{ memcmp: { offset: O, bytes: new PublicKey(quote).toBase58() } }],
    dataSlice: { offset: 0, length: 8 + 1040 },
    encoding: 'base64',
  });
  console.log('configs with quote', quote, ':', res.length);
  for (const acc of res.slice(0, 20)) {
    const b = Buffer.from(acc.account.data[0], 'base64');
    const u64 = (o) => b.readBigUInt64LE(O + o);
    const u128 = (o) => {
      const s = b.subarray(O + o, O + o + 16);
      let v = 0n;
      for (let i = 15; i >= 0; i--) v = (v << 8n) | BigInt(s[i]);
      return v;
    };
    console.log('---', acc.pubkey.toBase58());
    console.log('  cliff_fee_numerator  ', u64(96).toString());
    console.log('  secondFactor         ', u64(104).toString());
    console.log('  thirdFactor          ', u64(112).toString());
    console.log('  firstFactor u16      ', b.readUInt16LE(O + 96 + 24));
    console.log('  baseFeeMode          ', Number(b[O + 96 + 26]));
    console.log('  collectFeeMode       ', Number(b[O + 224]));
    console.log('  migrationOption      ', Number(b[O + 225]));
    console.log('  tokenDecimal         ', Number(b[O + 227]));
    console.log('  migrationQuoteThresh ', u64(256).toString());
    console.log('  migrationSqrtPrice   ', u128(272).toString());
    console.log('  sqrtStartPrice       ', u128(384).toString());
    console.log('  curve[0].sqrtPrice   ', u128(400).toString());
    console.log('  curve[0].liquidity   ', u128(416).toString());
    console.log('  curve[1].sqrtPrice   ', u128(432).toString());
    console.log('  curve[1].liquidity   ', u128(448).toString());
  }
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });