import { describe, expect, it } from 'vitest';
import { matchResourceTemplateUri } from './sdk-compat.js';

describe('MCP SDK compatibility resource templates', () => {
  it('matches template placeholders and extracts path-segment arguments', () => {
    expect(matchResourceTemplateUri('sap://agent/{wallet}/profile', 'sap://agent/28VE/profile')).toEqual({
      args: {
        wallet: '28VE',
      },
    });
  });

  it('treats template literal regex characters as plain text', () => {
    expect(matchResourceTemplateUri('sap://agent.v1/{wallet}', 'sap://agent.v1/28VE')).toEqual({
      args: {
        wallet: '28VE',
      },
    });
    expect(matchResourceTemplateUri('sap://agent.v1/{wallet}', 'sap://agentXv1/28VE')).toBeUndefined();
  });

  it('does not let placeholder values span path separators', () => {
    expect(matchResourceTemplateUri('sap://agent/{wallet}', 'sap://agent/28VE/profile')).toBeUndefined();
  });
});
