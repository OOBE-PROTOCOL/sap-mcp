import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILTIN_TOOL_MODULES } from '../tools/builtin-tool-modules.js';
import {
  ToolCardRegistry,
  buildToolCardCoverageReport,
  classifyToolCardCoverage,
  resolveGenericCardCoverage,
} from './tool-card-registry.js';

const repoRoot = process.cwd();

describe('ToolCardRegistry MCP Apps cards', () => {
  it('escapes dynamic protocol labels in agent cards', () => {
    const registry = new ToolCardRegistry('0.0.0-test', '3YfahM9yqdXEQjDLedME76wnynSzqGaUUBzMNJKzTjiB');
    const html = registry.render('sap_get_agent_profile', {
      agentName: '<script>alert("agent")</script>',
      capabilities: ['trading'],
      protocols: ['sap', '<img src=x onerror=alert(1)>'],
      isActive: true,
    });

    expect(html).not.toContain('<script>alert("agent")</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;alert(&quot;agent&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes raw address-link values before inserting them into card HTML', () => {
    const registry = new ToolCardRegistry('0.0.0-test', '<img src=x onerror=alert(1)>');
    const html = registry.render('magicblock_transfer', {
      type: 'sol',
      amount: 1,
      symbol: 'SOL',
      from: '<svg onload=alert(1)>',
      to: 'javascript:alert(1)',
      status: 'confirmed',
      signature: '<bad>',
    });

    expect(html).not.toContain('<svg onload=alert(1)>');
    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).not.toContain('<bad>');
    expect(html).toContain('&lt;svg...(1)&gt;');
    expect(html).toContain('https://solscan.io/account/%3Csvg%20onload%3Dalert(1)%3E');
    expect(html).toContain('javascript%3Aalert(1)');
    expect(html).toContain('&lt;bad&gt;');
  });

  it('routes hyphenated MCP tool names to their specialized card adapters', () => {
    const registry = new ToolCardRegistry('0.0.0-test', '3YfahM9yqdXEQjDLedME76wnynSzqGaUUBzMNJKzTjiB');

    const transfer = registry.render('spl-token_transferSol', {
      amount: 1.25,
      symbol: 'SOL',
      from: '3YfahM9yqdXEQjDLedME76wnynSzqGaUUBzMNJKzTjiB',
      to: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      status: 'confirmed',
    });
    const nft = registry.render('metaplex-nft_mintNFT', {
      action: 'mint',
      collectionName: 'SAP Agents',
      nftName: 'Agent #001',
      mintAddress: '7xKp7nQmN2qR8sT4',
      status: 'success',
    });

    expect(transfer).toContain('<title>Transfer</title>');
    expect(transfer).toContain('1.25');
    expect(nft).toContain('<title>NFT Operation</title>');
    expect(nft).toContain('SAP Agents');
  });

  it('classifies specialized and generic card coverage for release diagnostics', () => {
    expect(classifyToolCardCoverage('sap_get_agent_profile')).toBe('specialized');
    expect(classifyToolCardCoverage('sap_preview_transaction')).toBe('generic-build');
    expect(classifyToolCardCoverage('sap_sign_transaction')).toBe('generic-write');
    expect(classifyToolCardCoverage('sap_payments_call_paid_tool')).toBe('generic-write');
    expect(classifyToolCardCoverage('sap_payments_finalize_transaction')).toBe('generic-write');
    expect(resolveGenericCardCoverage('sap_quick_context')).toBe('generic-read');

    const report = buildToolCardCoverageReport([
      'sap_get_agent_profile',
      'sap_get_agent_profile',
      'sap_preview_transaction',
      'sap_quick_context',
    ]);

    expect(report).toMatchObject({
      totalTools: 3,
      specializedTools: 1,
      genericTools: 2,
      byCoverage: {
        specialized: 1,
        'generic-read': 1,
        'generic-write': 0,
        'generic-build': 1,
      },
    });
    expect(report.entries.map((entry) => entry.toolName)).toEqual([
      'sap_get_agent_profile',
      'sap_preview_transaction',
      'sap_quick_context',
    ]);
  });

  it('provides card coverage for every built-in module expected-tool sentinel', () => {
    const expectedTools = BUILTIN_TOOL_MODULES.flatMap((module) => [...(module.expectedTools ?? [])]);
    const report = buildToolCardCoverageReport(expectedTools);

    expect(report.totalTools).toBe(new Set(expectedTools).size);
    expect(report.totalTools).toBeGreaterThan(20);
    expect(report.entries.every((entry) => entry.coverage.length > 0)).toBe(true);
    expect(report.byCoverage.specialized).toBeGreaterThan(0);
    expect(report.byCoverage['generic-read'] + report.byCoverage['generic-write'] + report.byCoverage['generic-build']).toBe(report.genericTools);
  });

  it('keeps contract-required high-value tools on specialized MCP Apps Cards', () => {
    const contract = JSON.parse(readFileSync(join(repoRoot, 'config/mcp-apps-card-contracts.json'), 'utf-8')) as {
      minimumSpecializedToolsAcrossRuntimeProfiles: number;
      requiredSpecializedTools: string[];
    };
    const expectedTools = BUILTIN_TOOL_MODULES.flatMap((module) => [...(module.expectedTools ?? [])]);
    const report = buildToolCardCoverageReport(expectedTools);

    expect(report.specializedTools).toBeGreaterThanOrEqual(contract.minimumSpecializedToolsAcrossRuntimeProfiles);
    for (const toolName of contract.requiredSpecializedTools) {
      expect(expectedTools).toContain(toolName);
      expect(classifyToolCardCoverage(toolName)).toBe('specialized');
    }
  });
});
