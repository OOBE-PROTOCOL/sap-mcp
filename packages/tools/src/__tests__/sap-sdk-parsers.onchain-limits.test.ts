/**
 * On-chain validator parity tests for the sap-sdk-parsers module.
 *
 * Every test pins a check performed by the SAP mainnet validator
 * (programs/synapse-agent-sap/src/validator.rs) so invalid identity
 * payloads fail at BUILDER time with an actionable message instead of
 * as an opaque post-preview RPC simulation Anchor error in the Steve
 * chat (the 6005 TooManyProtocols incident, 2026-09-06).
 *
 * Limits mirror AgentAccount constants in state.rs:
 * name ≤64B (no control chars), description ≤256B, agentId ≤128B,
 * URIs ≤256B, caps ≤10, protocols ≤5, tiers ≤5, curve points ≤5.
 */
import { describe, it, expect } from 'vitest';
import {
  parseCapabilities,
  parseProtocols,
  validateIdentityArgsOnChain,
  validateNameOnChain,
  validateDescriptionOnChain,
  validateAgentIdOnChain,
  validateUriOnChain,
  validateX402EndpointOnChain,
  MAX_CAPABILITIES,
  MAX_PROTOCOLS,
  MAX_PRICING_TIERS,
  MAX_VOLUME_CURVE_POINTS,
} from '../sap-sdk-parsers.js';

const VALID_ARGS = {
  name: 'Solking Alpha',
  description: 'Perp trading agent',
  agentId: null,
  agentUri: null,
  x402Endpoint: null,
  capabilities: [{ id: 'synapse-agent-protocol:perp-trading', description: null, protocolId: null, version: null }],
  pricing: [],
  protocols: ['synapse-agent-protocol'],
};

describe('on-chain limits (mirror state.rs AgentAccount constants)', () => {
  it('exposes the exact on-chain constants', () => {
    expect(MAX_CAPABILITIES).toBe(10);
    expect(MAX_PROTOCOLS).toBe(5);
    expect(MAX_PRICING_TIERS).toBe(5);
    expect(MAX_VOLUME_CURVE_POINTS).toBe(5);
  });
});

describe('parseProtocols — 6005 TooManyProtocols', () => {
  it('accepts up to 5 protocol tags', () => {
    expect(parseProtocols(['a', 'b', 'c', 'd', 'e'])).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('rejects 6 protocol tags with the SAP error code', () => {
    expect(() => parseProtocols(['a', 'b', 'c', 'd', 'e', 'f'])).toThrow(/6005 TooManyProtocols/);
  });
});

describe('parseCapabilities — 6003/6026/6027', () => {
  it('rejects more than 10 capabilities', () => {
    const caps = Array.from({ length: 11 }, (_, i) => `syn:${i}`);
    expect(() => parseCapabilities(caps)).toThrow(/6003 TooManyCapabilities/);
  });

  it('auto-namespaces bare ids (existing behavior preserved)', () => {
    expect(parseCapabilities(['perps'])[0].id).toBe('synapse-agent-protocol:perps');
  });

  it('validateCapabilitiesOnChain rejects empty protocol part', () => {
    const caps = parseCapabilities([':perps']);
    expect(() => validateIdentityArgsOnChain({ ...VALID_ARGS, capabilities: caps })).toThrow(/6026 InvalidCapabilityFormat/);
  });

  it('validateCapabilitiesOnChain rejects empty capability part', () => {
    const caps = parseCapabilities(['syn:']);
    expect(() => validateIdentityArgsOnChain({ ...VALID_ARGS, capabilities: caps })).toThrow(/6026 InvalidCapabilityFormat/);
  });

  it('rejects duplicate capability ids', () => {
    const caps = parseCapabilities(['syn:perps', 'syn:perps']);
    expect(() => validateIdentityArgsOnChain({ ...VALID_ARGS, capabilities: caps })).toThrow(/6027 DuplicateCapability/);
  });

  it('rejects capability description > 128 bytes (state.rs max_len)', () => {
    const caps = parseCapabilities([{ id: 'syn:perps', description: 'x'.repeat(129) }]);
    expect(() => validateIdentityArgsOnChain({ ...VALID_ARGS, capabilities: caps })).toThrow(/128/);
  });

  it('rejects capability version > 16 bytes (state.rs max_len)', () => {
    const caps = parseCapabilities([{ id: 'syn:perps', version: '1.0.0'.repeat(4) }]);
    expect(() => validateIdentityArgsOnChain({ ...VALID_ARGS, capabilities: caps })).toThrow(/16/);
  });
});

describe('name validation — 6000/6022/6023', () => {
  it('accepts a 64-byte name', () => {
    expect(() => validateNameOnChain('x'.repeat(64))).not.toThrow();
  });

  it('rejects a 65-byte name with the SAP error code', () => {
    expect(() => validateNameOnChain('x'.repeat(65))).toThrow(/6000 NameTooLong/);
  });

  it('counts UTF-8 bytes, not JS chars (emoji)', () => {
    // 30 emoji = 120 UTF-8 bytes but 30 JS chars
    expect(() => validateNameOnChain('🚀'.repeat(30))).toThrow(/6000 NameTooLong/);
  });

  it('rejects empty name', () => {
    expect(() => validateNameOnChain('')).toThrow(/6022 EmptyName/);
  });

  it('rejects control characters (newline, tab)', () => {
    expect(() => validateNameOnChain('Agent\nX')).toThrow(/6023 ControlCharInName/);
    expect(() => validateNameOnChain('Agent\tX')).toThrow(/6023 ControlCharInName/);
  });
});

describe('description validation — 6001/6024', () => {
  it('accepts a 256-byte description', () => {
    expect(() => validateDescriptionOnChain('x'.repeat(256))).not.toThrow();
  });

  it('rejects a 257-byte description', () => {
    expect(() => validateDescriptionOnChain('x'.repeat(257))).toThrow(/6001 DescriptionTooLong/);
  });

  it('rejects empty description', () => {
    expect(() => validateDescriptionOnChain('')).toThrow(/6024 EmptyDescription/);
  });
});

describe('agentId / URI validation — 6025/6002', () => {
  it('accepts a 128-byte agentId', () => {
    expect(() => validateAgentIdOnChain('x'.repeat(128))).not.toThrow();
  });

  it('rejects a 129-byte agentId', () => {
    expect(() => validateAgentIdOnChain('x'.repeat(129))).toThrow(/6025 AgentIdTooLong/);
  });

  it('accepts a 256-byte URI and rejects 257', () => {
    expect(() => validateUriOnChain('x'.repeat(256), 'agentUri')).not.toThrow();
    expect(() => validateUriOnChain('x'.repeat(257), 'agentUri')).toThrow(/6002 UriTooLong/);
  });
});

describe('x402 endpoint validation — 6032/6002', () => {
  it('accepts an https endpoint', () => {
    expect(() => validateX402EndpointOnChain('https://agent.example.com/x402')).not.toThrow();
  });

  it('rejects http (non-TLS) endpoints', () => {
    expect(() => validateX402EndpointOnChain('http://agent.example.com/x402')).toThrow(/6032 InvalidX402Endpoint/);
  });

  it('rejects endpoints without a scheme', () => {
    expect(() => validateX402EndpointOnChain('agent.example.com/x402')).toThrow(/6032 InvalidX402Endpoint/);
  });
});

describe('pricing validation — 6004/6028/6029/6030/6035/6033/6142', () => {
  const tier = (overrides: Record<string, unknown>) => ({
    tierId: 'default',
    pricePerCall: { toString: () => '0' } as never,
    minPricePerCall: null,
    maxPricePerCall: null,
    rateLimit: 60,
    maxCallsPerSession: 1000,
    burstLimit: null,
    tokenType: 'sol' as never,
    tokenMint: null,
    tokenDecimals: 9,
    settlementMode: null,
    minEscrowDeposit: null,
    batchIntervalSec: null,
    volumeCurve: null,
    ...overrides,
  });

  it('accepts 5 tiers, rejects 6', () => {
    const five = Array.from({ length: 5 }, (_, i) => tier({ tierId: `t${i}` }));
    expect(() => validateIdentityArgsOnChain({ ...VALID_ARGS, pricing: five })).not.toThrow();
    const six = Array.from({ length: 6 }, (_, i) => tier({ tierId: `t${i}` }));
    expect(() => validateIdentityArgsOnChain({ ...VALID_ARGS, pricing: six })).toThrow(/6004 TooManyPricingTiers/);
  });

  it('rejects duplicate tier ids', () => {
    const tiers = [tier({ tierId: 'standard' }), tier({ tierId: 'standard' })];
    expect(() => validateIdentityArgsOnChain({ ...VALID_ARGS, pricing: tiers })).toThrow(/6029 DuplicateTierId/);
  });

  it('rejects zero rateLimit', () => {
    const tiers = [tier({ rateLimit: 0 })];
    expect(() => validateIdentityArgsOnChain({ ...VALID_ARGS, pricing: tiers })).toThrow(/6030 InvalidRateLimit/);
  });

  it('rejects min price > max price', () => {
    const tiers = [
      tier({
        minPricePerCall: { gt: (_o: unknown) => true } as never,
        maxPricePerCall: { gt: () => false } as never,
      }),
    ];
    expect(() => validateIdentityArgsOnChain({ ...VALID_ARGS, pricing: tiers })).toThrow(/6035 MinPriceExceedsMax/);
  });

  it('rejects volume curve with non-ascending afterCalls', () => {
    const tiers = [
      tier({
        volumeCurve: [
          { afterCalls: 100, pricePerCall: { gt: () => false } as never },
          { afterCalls: 100, pricePerCall: { gt: () => false } as never },
        ],
      }),
    ];
    expect(() => validateIdentityArgsOnChain({ ...VALID_ARGS, pricing: tiers })).toThrow(/6033 InvalidVolumeCurve/);
  });

  it('rejects volume curve with rising prices (6142)', () => {
    const tiers = [
      tier({
        volumeCurve: [
          { afterCalls: 100, pricePerCall: { gt: () => false } as never },
          { afterCalls: 200, pricePerCall: { gt: () => true } as never },
        ],
      }),
    ];
    expect(() => validateIdentityArgsOnChain({ ...VALID_ARGS, pricing: tiers })).toThrow(/6142 VolumeCurveNotDescending/);
  });
});

describe('validateIdentityArgsOnChain — optional-field semantics', () => {
  it('passes a fully valid payload', () => {
    expect(() => validateIdentityArgsOnChain(VALID_ARGS)).not.toThrow();
  });

  it('skips absent (null/undefined) fields', () => {
    expect(() => validateIdentityArgsOnChain({ name: null, description: undefined })).not.toThrow();
  });

  it('validates x402Endpoint when present', () => {
    expect(() =>
      validateIdentityArgsOnChain({ ...VALID_ARGS, x402Endpoint: 'http://insecure.example.com' }),
    ).toThrow(/6032 InvalidX402Endpoint/);
  });
});

describe('realistic regression — the Solking Alpha registration incident', () => {
  it('a 6-protocol registration now fails at builder time with 6005 (previously only on-chain)', () => {
    const protocols = ['synapse-agent-protocol', 'sap-mcp', 'oobe-steve', 'jupiter', 'pyth', 'x402'];
    expect(() => parseProtocols(protocols)).toThrow(/6005 TooManyProtocols/);
  });

  it('a correct 2-protocol registration passes', () => {
    expect(() => parseProtocols(['synapse-agent-protocol', 'sap-mcp'])).not.toThrow();
  });
});