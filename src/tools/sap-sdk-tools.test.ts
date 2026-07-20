import { describe, expect, it } from 'vitest';
import { SettlementMode, TokenType } from '@oobe-protocol-labs/synapse-sap-sdk/types';
import { parseRegisterAgentArgs, parseUpdateAgentArgs } from './sap-sdk-tools.js';

describe('SAP SDK tool argument parsing', () => {
  it('preserves USDC x402 pricing fields for agent-commerce registration', () => {
    const args = parseRegisterAgentArgs({
      name: 'XONA Agent',
      description: 'Creative x402 agent',
      capabilities: [
        {
          id: 'creative:imageGeneration',
          description: 'Text-to-image via x402',
          protocolId: 'creative',
          version: '1.0.0',
        },
      ],
      pricing: [
        {
          tierId: 'standard',
          pricePerCall: '1000',
          tokenType: 'usdc',
          tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          settlementMode: 'x402',
          rateLimit: 10,
          maxCallsPerSession: 100,
          volumeCurve: [
            { afterCalls: 100, pricePerCall: '800' },
          ],
        },
      ],
      protocols: ['sap', 'mcp', 'creative', 'x402'],
      agentId: 'xona',
      metadataUri: 'https://api.xona-agent.com/agent.json',
      x402Endpoint: 'https://api.xona-agent.com/.well-known/x402',
    });

    expect(args.pricing[0].tokenType).toEqual(TokenType.Usdc);
    expect(args.pricing[0].tokenDecimals).toBe(6);
    expect(args.pricing[0].settlementMode).toEqual(SettlementMode.X402);
    expect(args.pricing[0].pricePerCall.toString(10)).toBe('1000');
    expect(args.pricing[0].volumeCurve?.[0]?.afterCalls).toBe(100);
    expect(args.agentUri).toBe('https://api.xona-agent.com/agent.json');
  });

  it('requires tokenMint for arbitrary SPL pricing tiers', () => {
    expect(() => parseRegisterAgentArgs({
      name: 'Bad Agent',
      description: 'Bad SPL pricing',
      capabilities: ['custom:test'],
      pricing: [{ pricePerCall: '1', tokenType: 'spl' }],
      protocols: ['sap'],
    })).toThrow('pricing.tokenMint is required when tokenType is spl');
  });

  it('parses update fields as replacements without requiring registration fields', () => {
    const args = parseUpdateAgentArgs({
      capabilities: ['jupiter:swap', { id: 'sns:identity', protocolId: 'sns' }],
      pricing: [{ pricePerCall: '500', tokenType: 'usdc', settlementMode: 'x402' }],
      metadataUri: 'https://example.com/agent-metadata.json',
    });

    expect(args.name).toBeNull();
    expect(args.capabilities?.map((item) => item.id)).toEqual(['jupiter:swap', 'sns:identity']);
    expect(args.pricing?.[0]?.tokenType).toEqual(TokenType.Usdc);
    expect(args.pricing?.[0]?.settlementMode).toEqual(SettlementMode.X402);
    expect(args.agentUri).toBe('https://example.com/agent-metadata.json');
  });
});
