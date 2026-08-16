/**
 * @name runtime/payment-bridge-process
 * @description Process lock and diagnostics for the local sap_payments stdio bridge.
 *
 * The lock is intentionally scoped by profile + runtime id, not globally. Users
 * can run Codex and Hermes at the same time, but one runtime should not spawn
 * multiple payment bridges for the same SAP profile.
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, openSync, readFileSync, closeSync, unlinkSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { getDataDir } from '@oobe-protocol-labs/sap-mcp-config-runtime/paths';
import { getActiveProfile } from '@oobe-protocol-labs/sap-mcp-config-runtime/profiles';
import { MCP_SERVER_VERSION } from '@oobe-protocol-labs/sap-mcp-core/constants';

export interface PaymentBridgeLockRecord {
  pid: number;
  ppid: number;
  profileName: string;
  runtimeId: string;
  version: string;
  createdAt: string;
  lockPath: string;
}

export interface PaymentBridgeProcessInfo {
  pid: number;
  ppid?: number;
  elapsed?: string;
  command: string;
  currentProcess: boolean;
}

export interface PaymentBridgeProcessStatus {
  pid: number;
  ppid: number;
  version: string;
  bridgeOnly: boolean;
  profileName: string;
  runtimeId: string;
  lock: {
    enabled: boolean;
    path: string;
    heldByCurrentProcess: boolean;
    record?: Omit<PaymentBridgeLockRecord, 'lockPath'>;
    stale: boolean;
  };
  processes: {
    supported: boolean;
    currentProcessVisible: boolean;
    possibleSapMcpProcesses: PaymentBridgeProcessInfo[];
    duplicateCount: number;
    warning?: string;
  };
  nextAction: string;
}

export class PaymentBridgeLockError extends Error {
  constructor(
    message: string,
    public readonly record: PaymentBridgeLockRecord,
  ) {
    super(message);
    this.name = 'PaymentBridgeLockError';
  }
}

const LOCK_RELEASE_HANDLERS = new Set<() => void>();
let activeLock: PaymentBridgeLockRecord | undefined;
let exitHandlersRegistered = false;
let orphanWatchdog: NodeJS.Timeout | undefined;

function sanitizeLockPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'default';
}

export function resolvePaymentBridgeProfileName(): string {
  const fromEnv = process.env.SAP_MCP_PROFILE?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  try {
    return getActiveProfile();
  } catch {
    return 'active-profile';
  }
}

export function resolvePaymentBridgeRuntimeId(): string {
  const fromEnv = process.env.SAP_MCP_RUNTIME_ID?.trim()
    || process.env.SAP_MCP_CLIENT_ID?.trim()
    || process.env.MCP_RUNTIME_ID?.trim();
  if (fromEnv) {
    return sanitizeLockPart(fromEnv);
  }

  return 'default-runtime';
}

export function getPaymentBridgeLockPath(profileName = resolvePaymentBridgeProfileName(), runtimeId = resolvePaymentBridgeRuntimeId()): string {
  return join(getDataDir(), 'locks', `sap-payments-${sanitizeLockPart(profileName)}-${sanitizeLockPart(runtimeId)}.lock`);
}

function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readLockRecord(lockPath: string): PaymentBridgeLockRecord | undefined {
  if (!existsSync(lockPath)) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf-8')) as Partial<PaymentBridgeLockRecord>;
    if (typeof parsed.pid !== 'number') {
      return undefined;
    }
    return {
      pid: parsed.pid,
      ppid: typeof parsed.ppid === 'number' ? parsed.ppid : 0,
      profileName: typeof parsed.profileName === 'string' ? parsed.profileName : 'unknown',
      runtimeId: typeof parsed.runtimeId === 'string' ? parsed.runtimeId : 'unknown',
      version: typeof parsed.version === 'string' ? parsed.version : 'unknown',
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : 'unknown',
      lockPath,
    };
  } catch {
    return undefined;
  }
}

function isLockRecordStale(record: PaymentBridgeLockRecord): boolean {
  if (!isPidAlive(record.pid)) {
    return true;
  }

  // A live bridge whose original parent runtime is gone cannot be used by a
  // new MCP session. Treat it as stale so the replacement bridge can start.
  if (record.ppid > 1 && !isPidAlive(record.ppid)) {
    return true;
  }

  return false;
}

function removeLockIfOwned(record: PaymentBridgeLockRecord): void {
  const current = readLockRecord(record.lockPath);
  if (!current || current.pid !== process.pid) {
    return;
  }

  try {
    unlinkSync(record.lockPath);
  } catch {
    // Best-effort cleanup; the next process will stale-check the pid.
  }
}

function registerExitHandlers(): void {
  if (exitHandlersRegistered) {
    return;
  }
  exitHandlersRegistered = true;

  const releaseAll = () => {
    for (const release of LOCK_RELEASE_HANDLERS) {
      release();
    }
  };

  process.once('exit', releaseAll);
  process.once('beforeExit', releaseAll);
}

function startOrphanWatchdog(parentPid: number): void {
  if (orphanWatchdog || parentPid <= 1 || process.env.SAP_MCP_EXIT_ON_ORPHANED_BRIDGE === 'false') {
    return;
  }

  orphanWatchdog = setInterval(() => {
    const parentChangedToInit = process.ppid <= 1;
    const originalParentGone = !isPidAlive(parentPid);
    if (parentChangedToInit || originalParentGone) {
      releasePaymentBridgeProcessLock();
      process.exit(0);
    }
  }, 5000);
  orphanWatchdog.unref();
}

export function acquirePaymentBridgeProcessLock(): PaymentBridgeLockRecord | undefined {
  if (process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY !== 'true') {
    return undefined;
  }

  const profileName = resolvePaymentBridgeProfileName();
  const runtimeId = resolvePaymentBridgeRuntimeId();
  const lockPath = getPaymentBridgeLockPath(profileName, runtimeId);
  mkdirSync(join(getDataDir(), 'locks'), { recursive: true, mode: 0o700 });

  const existing = readLockRecord(lockPath);
  if (existing) {
    if (existing.pid !== process.pid && !isLockRecordStale(existing)) {
      throw new PaymentBridgeLockError(
        `sap_payments bridge is already running for profile "${profileName}" in runtime "${runtimeId}" (pid ${existing.pid}). Fully quit/restart the agent runtime instead of starting a second bridge.`,
        existing,
      );
    }

    try {
      unlinkSync(lockPath);
    } catch {
      // If unlink fails, the atomic open below will report the real issue.
    }
  }

  const record: PaymentBridgeLockRecord = {
    pid: process.pid,
    ppid: process.ppid,
    profileName,
    runtimeId,
    version: MCP_SERVER_VERSION,
    createdAt: new Date().toISOString(),
    lockPath,
  };

  const fd = openSync(lockPath, 'wx', 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
  } finally {
    closeSync(fd);
  }

  activeLock = record;
  const release = () => removeLockIfOwned(record);
  LOCK_RELEASE_HANDLERS.add(release);
  registerExitHandlers();
  startOrphanWatchdog(record.ppid);

  return record;
}

export function releasePaymentBridgeProcessLock(): void {
  if (!activeLock) {
    return;
  }

  removeLockIfOwned(activeLock);
  activeLock = undefined;
  if (orphanWatchdog) {
    clearInterval(orphanWatchdog);
    orphanWatchdog = undefined;
  }
}

function parsePsOutput(output: string): PaymentBridgeProcessInfo[] {
  const currentScript = basename(process.argv[1] || '').toLowerCase();

  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map((line): PaymentBridgeProcessInfo | undefined => {
      const match = /^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(line);
      if (!match) {
        return undefined;
      }
      const [, pidRaw, ppidRaw, elapsed, command] = match;
      const pid = Number(pidRaw);
      const ppid = Number(ppidRaw);
      return {
        pid,
        ppid,
        elapsed,
        command,
        currentProcess: pid === process.pid,
      };
    })
    .filter((item): item is PaymentBridgeProcessInfo => item !== undefined)
    .filter((item) => {
      const command = item.command.toLowerCase();
      return command.includes('sap-mcp-server')
        || command.includes('@oobe-protocol-labs/sap-mcp-server')
        || Boolean(currentScript && command.includes(currentScript));
    });
}

export function listPossibleSapMcpProcesses(): { supported: boolean; processes: PaymentBridgeProcessInfo[]; warning?: string } {
  if (process.platform === 'win32') {
    return {
      supported: false,
      processes: [],
      warning: 'Process listing is not available from the portable wizard on Windows. Use Task Manager if you suspect stale node/npx sap-mcp-server processes.',
    };
  }

  try {
    const output = execFileSync('ps', ['-axo', 'pid=,ppid=,etime=,command='], {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
    });
    return {
      supported: true,
      processes: parsePsOutput(output),
    };
  } catch (error) {
    return {
      supported: false,
      processes: [],
      warning: `Could not inspect local processes: ${(error as Error).message}`,
    };
  }
}

export function getPaymentBridgeProcessStatus(): PaymentBridgeProcessStatus {
  const profileName = resolvePaymentBridgeProfileName();
  const runtimeId = resolvePaymentBridgeRuntimeId();
  const lockPath = getPaymentBridgeLockPath(profileName, runtimeId);
  const record = readLockRecord(lockPath);
  const stale = Boolean(record && isLockRecordStale(record));
  const processListing = listPossibleSapMcpProcesses();
  const duplicateCount = Math.max(0, processListing.processes.length - 1);
  const warning = duplicateCount > 0
    ? 'Multiple SAP MCP-looking processes are running. Fully quit the agent runtime before restarting it; do not kill the active bridge during an MCP session.'
    : processListing.warning;

  return {
    pid: process.pid,
    ppid: process.ppid,
    version: MCP_SERVER_VERSION,
    bridgeOnly: process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY === 'true',
    profileName,
    runtimeId,
    lock: {
      enabled: process.env.SAP_MCP_PAYMENTS_BRIDGE_ONLY === 'true',
      path: lockPath,
      heldByCurrentProcess: record?.pid === process.pid,
      record: record ? {
        pid: record.pid,
        ppid: record.ppid,
        profileName: record.profileName,
        runtimeId: record.runtimeId,
        version: record.version,
        createdAt: record.createdAt,
      } : undefined,
      stale,
    },
    processes: {
      supported: processListing.supported,
      currentProcessVisible: processListing.processes.some(item => item.pid === process.pid),
      possibleSapMcpProcesses: processListing.processes,
      duplicateCount,
      warning,
    },
    nextAction: duplicateCount > 0
      ? 'Fully quit and reopen the agent runtime. Avoid manual process killing while a session is active because it closes the MCP resource.'
      : 'Bridge process topology looks normal.',
  };
}
