import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  CONFIG_APP_DIR,
  LEGACY_CONFIG_APP_DIR,
  getDataDir,
  getConfigDir,
  getPreferredConfigDir,
  getLegacyConfigDir,
  getKeypairsDir,
  getPreferredConfigDirForPlatform,
  defaultGeneratedWalletPath,
} from './paths.js';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  process.env = { ...ORIGINAL_ENV };
}

describe('path resolution', () => {
  afterEach(() => {
    restoreEnv();
  });

  describe('CONFIG_APP_DIR and LEGACY_CONFIG_APP_DIR', () => {
    it('uses mcp-sap as the preferred app dir', () => {
      expect(CONFIG_APP_DIR).toBe('mcp-sap');
    });

    it('uses sap-mcp as the legacy app dir', () => {
      expect(LEGACY_CONFIG_APP_DIR).toBe('sap-mcp');
    });
  });

  describe('getPreferredConfigDir()', () => {
    it('returns a path ending with the config app dir', () => {
      const dir = getPreferredConfigDir();
      expect(dir.endsWith(CONFIG_APP_DIR)).toBe(true);
    });

    it('respects XDG_CONFIG_HOME when set', () => {
      process.env.XDG_CONFIG_HOME = '/custom/xdg-home';
      const dir = getPreferredConfigDir();
      expect(dir).toBe(join('/custom/xdg-home', CONFIG_APP_DIR));
    });

    it('defaults to platform-specific config dir when XDG_CONFIG_HOME is unset', () => {
      delete process.env.XDG_CONFIG_HOME;
      const dir = getPreferredConfigDir();
      if (process.platform === 'win32') {
        // Windows uses APPDATA when XDG_CONFIG_HOME is unset.
        expect(dir.endsWith(CONFIG_APP_DIR)).toBe(true);
      } else {
        expect(dir).toBe(join(homedir(), '.config', CONFIG_APP_DIR));
      }
    });
  });

  describe('getLegacyConfigDir()', () => {
    it('returns a path ending with the legacy app dir', () => {
      const dir = getLegacyConfigDir();
      expect(dir.endsWith(LEGACY_CONFIG_APP_DIR)).toBe(true);
    });

    it('respects XDG_CONFIG_HOME when set', () => {
      process.env.XDG_CONFIG_HOME = '/custom/xdg-home';
      expect(getLegacyConfigDir()).toBe(join('/custom/xdg-home', LEGACY_CONFIG_APP_DIR));
    });
  });

  describe('getConfigDir()', () => {
    it('returns the same value as getPreferredConfigDir()', () => {
      delete process.env.XDG_CONFIG_HOME;
      expect(getConfigDir()).toBe(getPreferredConfigDir());
    });
  });

  describe('getDataDir()', () => {
    it('returns a path ending with the config app dir', () => {
      const dir = getDataDir();
      expect(dir.endsWith(CONFIG_APP_DIR)).toBe(true);
    });

    it('respects XDG_DATA_HOME when set', () => {
      process.env.XDG_DATA_HOME = '/custom/xdg-data';
      expect(getDataDir()).toBe(join('/custom/xdg-data', CONFIG_APP_DIR));
    });

    it('defaults to platform-specific data dir when XDG_DATA_HOME is unset', () => {
      delete process.env.XDG_DATA_HOME;
      const dir = getDataDir();
      if (process.platform === 'win32') {
        expect(dir.endsWith(CONFIG_APP_DIR)).toBe(true);
      } else {
        expect(dir).toBe(join(homedir(), '.local', 'share', CONFIG_APP_DIR));
      }
    });
  });

  describe('getKeypairsDir()', () => {
    it('returns a keypairs subdirectory inside the preferred config dir', () => {
      delete process.env.XDG_CONFIG_HOME;
      const expected = join(homedir(), '.config', CONFIG_APP_DIR, 'keypairs');
      expect(getKeypairsDir()).toBe(expected);
    });

    it('respects XDG_CONFIG_HOME', () => {
      process.env.XDG_CONFIG_HOME = '/custom/xdg-home';
      expect(getKeypairsDir()).toBe(join('/custom/xdg-home', CONFIG_APP_DIR, 'keypairs'));
    });
  });

  describe('defaultGeneratedWalletPath()', () => {
    it('returns a keypair JSON path inside the keypairs dir with default label', () => {
      delete process.env.XDG_CONFIG_HOME;
      const path = defaultGeneratedWalletPath();
      expect(path).toBe(join(getKeypairsDir(), 'agent-wallet-keypair.json'));
    });

    it('uses the provided label in the filename', () => {
      const path = defaultGeneratedWalletPath('my-agent');
      expect(path.endsWith('my-agent-keypair.json')).toBe(true);
    });
  });

  describe('getPreferredConfigDirForPlatform()', () => {
    beforeEach(() => {
      delete process.env.XDG_CONFIG_HOME;
      delete process.env.APPDATA;
    });

    it('uses XDG_CONFIG_HOME when provided', () => {
      const dir = getPreferredConfigDirForPlatform(
        '/home/user',
        'linux',
        { XDG_CONFIG_HOME: '/custom/xdg' },
      );
      expect(dir).toBe(join('/custom/xdg', CONFIG_APP_DIR));
    });

    it('uses APPDATA on win32 when available', () => {
      const dir = getPreferredConfigDirForPlatform(
        'C:\\Users\\user',
        'win32',
        { APPDATA: 'C:\\Users\\user\\AppData\\Roaming' },
      );
      expect(dir).toBe(join('C:\\Users\\user\\AppData\\Roaming', CONFIG_APP_DIR));
    });

    it('falls back to home/AppData/Roaming on win32 when APPDATA is unset', () => {
      const dir = getPreferredConfigDirForPlatform(
        '/home/user',
        'win32',
        {},
      );
      expect(dir).toBe(join('/home/user', 'AppData', 'Roaming', CONFIG_APP_DIR));
    });

    it('uses ~/.config/<app> on non-windows, non-xdg platforms', () => {
      const dir = getPreferredConfigDirForPlatform(
        '/home/user',
        'linux',
        {},
      );
      expect(dir).toBe(join('/home/user', '.config', CONFIG_APP_DIR));
    });

    it('uses darwin default ~/.config path when no XDG override', () => {
      const dir = getPreferredConfigDirForPlatform(
        '/Users/test',
        'darwin',
        {},
      );
      expect(dir).toBe(join('/Users/test', '.config', CONFIG_APP_DIR));
    });
  });
});