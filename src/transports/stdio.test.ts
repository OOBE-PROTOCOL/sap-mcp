import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock('../../packages/core/src/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../../packages/core/src/logger.js';
import { startStdioTransport } from './stdio.js';

describe('stdio transport', () => {
  let mockServer: Server;
  let processOnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServer = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Server;

    // Prevent real signal handlers from being registered during tests
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
  });

  afterEach(() => {
    processOnSpy.mockRestore();
  });

  it('creates a StdioServerTransport instance', async () => {
    await startStdioTransport(mockServer);

    expect(StdioServerTransport).toHaveBeenCalledTimes(1);
  });

  it('connects the server to the transport', async () => {
    await startStdioTransport(mockServer);

    expect(mockServer.connect).toHaveBeenCalledTimes(1);
    const transportArg = (mockServer.connect as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(transportArg).toBeInstanceOf(StdioServerTransport);
  });

  it('logs startup and success messages', async () => {
    await startStdioTransport(mockServer);

    expect(logger.info).toHaveBeenCalledWith('Starting stdio transport');
    expect(logger.info).toHaveBeenCalledWith('stdio transport started successfully');
  });

  it('registers SIGINT and SIGTERM handlers', async () => {
    await startStdioTransport(mockServer);

    const signals = processOnSpy.mock.calls.map(call => call[0]);
    expect(signals).toContain('SIGINT');
    expect(signals).toContain('SIGTERM');
  });
});