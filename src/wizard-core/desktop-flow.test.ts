import { describe, expect, it } from 'vitest';
import { createDefaultDesktopWizardDraft, validateDesktopWizardDraft } from './desktop-flow.js';

describe('desktop wizard flow', () => {
  it('defaults to hosted SAP MCP plus the local payment bridge path', () => {
    const draft = createDefaultDesktopWizardDraft();

    expect(draft.mode).toBe('hosted-api');
    expect(draft.setupMode).toBe('full');
    expect(draft.createNewWallet).toBe(true);
    expect(draft.configureRuntimes).toContain('codex');
    expect(draft.installAddonBundle).toBe(true);
    expect(validateDesktopWizardDraft(draft)).toEqual([]);
  });
});
