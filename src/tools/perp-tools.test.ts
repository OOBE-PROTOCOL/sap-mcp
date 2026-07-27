import { describe, expect, it } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  ADRENA_POSITION_OWNER_MEMCMP_OFFSET,
  decodeAdrenaCustodyAccount,
  decodeAdrenaPositionAccount,
  discToBase58,
  normalizePerpProviderMarkets,
  readAdrenaLimitedString,
} from './perp-tools.js';

const DISC_CUSTODY = Buffer.from([1, 184, 48, 81, 93, 131, 63, 145]);
const DISC_POSITION = Buffer.from([170, 188, 143, 228, 122, 64, 247, 208]);

function writePubkey(buf: Buffer, offset: number, address: string): void {
  new PublicKey(address).toBuffer().copy(buf, offset);
}

function writeLimitedString(buf: Buffer, offset: number, value: string): void {
  const bytes = Buffer.from(value, 'utf8');
  bytes.copy(buf, offset, 0, Math.min(bytes.length, 31));
  buf[offset + 31] = Math.min(bytes.length, 31);
}

describe('perp provider normalization', () => {
  it('encodes Anchor account discriminators directly as base58 bytes', () => {
    // Custody discriminator = sha256("account:Custody")[0..8].
    // It must be the base58 encoding of the 8 bytes, not coerced into a 32-byte PublicKey.
    expect(discToBase58(Buffer.from([1, 184, 48, 81, 93, 131, 63, 145]))).toBe('HgWVUrv1XE');
  });

  it('normalizes provider payloads with markets arrays', () => {
    expect(normalizePerpProviderMarkets({
      markets: [
        { market: 'sol-perp', markPrice: 180 },
        { symbol: 'BTC-PERP', markPrice: 118000 },
      ],
    })).toEqual([
      { market: 'sol-perp', symbol: 'SOL-PERP', markPrice: 180 },
      { market: 'BTC-PERP', symbol: 'BTC-PERP', markPrice: 118000 },
    ]);
  });

  it('filters provider markets by symbol without treating empty as no venue support', () => {
    expect(normalizePerpProviderMarkets([
      { symbol: 'SOL-PERP' },
      { symbol: 'BTC-PERP' },
    ], 'SOL-PERP')).toEqual([
      { symbol: 'SOL-PERP', market: 'SOL-PERP' },
    ]);
  });

  it('decodes Adrena LimitedString as 31 bytes plus length', () => {
    const buf = Buffer.alloc(64);
    writeLimitedString(buf, 8, 'BONK/USD');
    expect(readAdrenaLimitedString(buf, 8)).toBe('BONK/USD');
  });

  it('uses the release/39 Position owner memcmp offset', () => {
    expect(ADRENA_POSITION_OWNER_MEMCMP_OFFSET).toBe(16);
  });

  it('decodes Adrena Custody accounts with ABI offsets, not legacy string guesses', () => {
    const custodyAddress = new PublicKey('8aJuzsgjxBnvRhDcfQBD7z4CUj7QoPEpaNwVd7KqsSk5');
    const buf = Buffer.alloc(1_168);
    DISC_CUSTODY.copy(buf, 0);
    buf[10] = 1;
    buf[11] = 1;
    buf[12] = 5;
    writePubkey(buf, 16, '4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34');
    writePubkey(buf, 48, '11111111111111111111111111111111');
    writePubkey(buf, 80, '11111111111111111111111111111111');
    writeLimitedString(buf, 112, 'BONK/USD');
    writeLimitedString(buf, 144, 'BONK/USD');
    buf.writeUInt32LE(50_000, 176);
    buf.writeUInt32LE(100_000, 180);
    buf.writeBigUInt64LE(1_000_000_000n, 184);
    buf.writeBigUInt64LE(2_500_000n, 408);
    buf.writeBigUInt64LE(1_500_000n, 608);
    buf[913] = 1;

    const decoded = decodeAdrenaCustodyAccount(custodyAddress, buf);
    expect(decoded?.market).toBe('BONK-PERP');
    expect(decoded?.decimals).toBe(5);
    expect(decoded?.maxInitialLeverage).toBe(5);
    expect(decoded?.openInterestLong).toBe(2.5);
    expect(decoded?.openInterestShort).toBe(1.5);
    expect(decoded?.markPrice).toBeNull();
  });

  it('decodes Adrena Position owner/side/price from release/39 offsets', () => {
    const owner = new PublicKey('3f8YwZjofSWP1fJWhuTMk7KmGunePvuTxSCxy2PiVqJX');
    const custody = '8aJuzsgjxBnvRhDcfQBD7z4CUj7QoPEpaNwVd7KqsSk5';
    const buf = Buffer.alloc(464);
    DISC_POSITION.copy(buf, 0);
    buf[9] = 1;
    owner.toBuffer().copy(buf, 16);
    writePubkey(buf, 48, '4bQRutgDJs6vuh6ZcWaPVXiQaBzbHketjbCDjL4oRN34');
    writePubkey(buf, 80, custody);
    writePubkey(buf, 112, '11111111111111111111111111111111');
    buf.writeBigUInt64LE(25_000_000_000n, 160);
    buf.writeBigUInt64LE(100_000_000n, 168);
    buf.writeBigUInt64LE(20_000_000n, 184);
    buf.writeBigUInt64LE(42n, 248);

    const decoded = decodeAdrenaPositionAccount(new PublicKey('11111111111111111111111111111111'), buf);
    expect(decoded?.owner).toBe(owner.toBase58());
    expect(decoded?.side).toBe('long');
    expect(decoded?.entryPrice).toBe(2.5);
    expect(decoded?.size).toBe(100);
    expect(decoded?.collateral).toBe(20);
    expect(decoded?.leverage).toBe(5);
  });
});
