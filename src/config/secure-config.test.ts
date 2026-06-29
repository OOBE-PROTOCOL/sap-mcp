import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { SecureConfigManager } from './secure-config.js';

const tempDirs: string[] = [];

function createTempConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sap-mcp-secure-config-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('SecureConfigManager approval workflow', () => {
  it('persists pending changes so a separate CLI process can approve them', async () => {
    const configDir = createTempConfigDir();
    const requester = new SecureConfigManager(configDir);

    requester.load();
    const result = await requester.update({ mode: 'local-dev-keypair' }, 'alice');

    expect(result.pendingChanges).toHaveLength(1);

    const approver = new SecureConfigManager(configDir);
    const pending = approver.getPendingChanges();

    expect(pending).toHaveLength(1);
    expect(pending[0]?.field).toBe('mode');
    expect(approver.approve(pending[0]?.id ?? '', 'bob')).toBe(true);

    const reloaded = new SecureConfigManager(configDir).load();
    expect(reloaded.mode).toBe('local-dev-keypair');
    expect(new SecureConfigManager(configDir).getPendingChanges()).toHaveLength(0);
  });

  it('does not create pending approvals for unchanged values', async () => {
    const configDir = createTempConfigDir();
    const manager = new SecureConfigManager(configDir);

    manager.load();
    const result = await manager.update({ mode: 'readonly' }, 'alice');

    expect(result.applied).toEqual([]);
    expect(result.pendingChanges).toEqual([]);
    expect(manager.getPendingChanges()).toEqual([]);
  });
});
