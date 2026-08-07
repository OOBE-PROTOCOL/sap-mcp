import { describe, expect, it } from 'vitest';
import { SERVER_METADATA, CAPABILITIES } from './server-metadata.js';
import {
  MCP_SERVER_NAME,
  MCP_SERVER_TITLE,
  MCP_SERVER_VERSION,
  MCP_SERVER_DESCRIPTION,
  MCP_SERVER_WEBSITE_URL,
  MCP_SERVER_ICON_URL,
} from '../core/constants.js';

describe('SERVER_METADATA', () => {
  it('exposes the server name from constants', () => {
    expect(SERVER_METADATA.name).toBe(MCP_SERVER_NAME);
    expect(typeof SERVER_METADATA.name).toBe('string');
    expect(SERVER_METADATA.name.length).toBeGreaterThan(0);
  });

  it('exposes the server title from constants', () => {
    expect(SERVER_METADATA.title).toBe(MCP_SERVER_TITLE);
    expect(SERVER_METADATA.title.length).toBeGreaterThan(0);
  });

  it('exposes the server version from constants', () => {
    expect(SERVER_METADATA.version).toBe(MCP_SERVER_VERSION);
    // Semver-like format
    expect(SERVER_METADATA.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exposes the server description from constants', () => {
    expect(SERVER_METADATA.description).toBe(MCP_SERVER_DESCRIPTION);
    expect(SERVER_METADATA.description.length).toBeGreaterThan(0);
  });

  it('has a static author string', () => {
    expect(SERVER_METADATA.author).toBe('OOBE Protocol Labs');
  });

  it('has MIT license', () => {
    expect(SERVER_METADATA.license).toBe('MIT');
  });

  it('exposes the homepage URL from constants', () => {
    expect(SERVER_METADATA.homepage).toBe(MCP_SERVER_WEBSITE_URL);
    expect(SERVER_METADATA.homepage).toMatch(/^https?:\/\//);
  });

  it('exposes a GitHub repository URL', () => {
    expect(SERVER_METADATA.repository).toContain('github.com');
    expect(SERVER_METADATA.repository).toMatch(/^https?:\/\//);
  });

  it('exposes a bugs/issues URL', () => {
    expect(SERVER_METADATA.bugs).toContain('github.com');
    expect(SERVER_METADATA.bugs).toContain('issues');
  });

  it('exposes the icon URL from constants', () => {
    expect(SERVER_METADATA.icon).toBe(MCP_SERVER_ICON_URL);
    expect(SERVER_METADATA.icon).toMatch(/^https?:\/\//);
  });

  it('has exactly the expected set of keys', () => {
    expect(Object.keys(SERVER_METADATA).sort()).toEqual(
      ['author', 'bugs', 'description', 'homepage', 'icon', 'license', 'name', 'repository', 'title', 'version'].sort(),
    );
  });
});

describe('CAPABILITIES', () => {
  it('has a tools object with a count', () => {
    expect(CAPABILITIES.tools).toBeDefined();
    expect(typeof CAPABILITIES.tools.count).toBe('number');
    expect(CAPABILITIES.tools.count).toBeGreaterThan(0);
  });

  it('has a categories object with tool counts', () => {
    expect(CAPABILITIES.tools.categories).toBeDefined();
    expect(typeof CAPABILITIES.tools.categories).toBe('object');
  });

  it('includes known tool categories', () => {
    const categories = Object.keys(CAPABILITIES.tools.categories);
    expect(categories).toContain('sap');
    expect(categories).toContain('sns');
    expect(categories).toContain('agentKit');
    expect(categories).toContain('transactions');
  });

  it('has category counts that are positive integers', () => {
    for (const [, count] of Object.entries(CAPABILITIES.tools.categories)) {
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    }
  });

  it('has category counts that sum to at most the total tool count', () => {
    const sum = Object.values(CAPABILITIES.tools.categories).reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(CAPABILITIES.tools.count);
  });
});