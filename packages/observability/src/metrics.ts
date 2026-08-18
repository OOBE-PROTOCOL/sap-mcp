/**
 * @name observability/metrics
 * @description Process-local Prometheus metrics for SAP MCP Server.
 *
 * The exporter is opt-in and VPS-only: it starts only when `enableMetrics` is
 * true in the server config (default false). On local user deployments metrics
 * stay disabled, preserving the current optional behavior. Tool-call counters
 * are incremented from the central `tools/call` handler in `sdk-compat.ts`
 * regardless of whether the HTTP exporter is running, but the recording is a
 * no-op until `initMetrics` is called, so there is zero overhead when disabled.
 *
 * Metrics exposed on the `/metrics` endpoint (Prometheus text format):
 *   - sap_mcp_tool_calls_total{tool,status}        counter
 *   - sap_mcp_tool_call_duration_seconds{tool}     histogram (bucketed)
 *   - sap_mcp_tool_calls_in_flight                 gauge
 *   - sap_mcp_requests_total{endpoint,status}      counter
 *   - sap_mcp_uptime_seconds                       gauge
 *
 * @module observability/metrics
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { logger } from '@oobe-protocol-labs/sap-mcp-core/logger';

/** Histogram buckets for tool-call duration in seconds. */
const DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];

interface ToolCallStats {
  total: number;
  ok: number;
  error: number;
  /** Observability bucket counts indexed by DURATION_BUCKETS. */
  durationBucket: number[];
  /** Cumulative duration in seconds (for rate/avg computation downstream). */
  durationSum: number;
}

interface MetricsState {
  enabled: boolean;
  startedAt: number;
  toolCalls: Map<string, ToolCallStats>;
  requests: Map<string, { total: number; ok: number; error: number }>;
  inFlight: number;
}

const state: MetricsState = {
  enabled: false,
  startedAt: Date.now(),
  toolCalls: new Map(),
  requests: new Map(),
  inFlight: 0,
};

/**
 * @name initMetrics
 * @description Enables metric collection. Safe to call multiple times; the first
 *   call records the baseline start time.
 */
export function initMetrics(): void {
  if (!state.enabled) {
    state.enabled = true;
    state.startedAt = Date.now();
    logger.info('Observability metrics collection enabled');
  }
}

/**
 * @name isMetricsEnabled
 * @description Reports whether metric collection is active.
 */
export function isMetricsEnabled(): boolean {
  return state.enabled;
}

function bucketIndex(durationSeconds: number): number {
  for (let i = 0; i < DURATION_BUCKETS.length; i++) {
    if (durationSeconds <= DURATION_BUCKETS[i]) {
      return i;
    }
  }
  return DURATION_BUCKETS.length;
}

/**
 * @name recordToolCall
 * @description Records a completed tool invocation. No-op when metrics are disabled.
 *
 * @param tool      — Canonical tool name.
 * @param durationMs — Call duration in milliseconds.
 * @param ok        — Whether the call returned without throwing.
 */
export function recordToolCall(tool: string, durationMs: number, ok: boolean): void {
  if (!state.enabled) {
    return;
  }
  const durationSeconds = durationMs / 1000;
  let stats = state.toolCalls.get(tool);
  if (!stats) {
    stats = {
      total: 0,
      ok: 0,
      error: 0,
      durationBucket: new Array(DURATION_BUCKETS.length + 1).fill(0),
      durationSum: 0,
    };
    state.toolCalls.set(tool, stats);
  }
  stats.total += 1;
  stats.durationSum += durationSeconds;
  if (ok) {
    stats.ok += 1;
  } else {
    stats.error += 1;
  }
  stats.durationBucket[bucketIndex(durationSeconds)] += 1;
}

/**
 * @name recordRequest
 * @description Records an inbound HTTP request (MCP endpoint, landing, well-known).
 *
 * @param endpoint — Logical endpoint label.
 * @param status   — HTTP status class (`ok` | `error`).
 */
export function recordRequest(endpoint: string, status: 'ok' | 'error'): void {
  if (!state.enabled) {
    return;
  }
  let entry = state.requests.get(endpoint);
  if (!entry) {
    entry = { total: 0, ok: 0, error: 0 };
    state.requests.set(endpoint, entry);
  }
  entry.total += 1;
  if (status === 'ok') {
    entry.ok += 1;
  } else {
    entry.error += 1;
  }
}

/**
 * @name trackInFlight
 * @description Increments the in-flight gauge on call start and decrements on finish.
 */
export function trackInFlight(delta: number): void {
  if (!state.enabled) {
    return;
  }
  state.inFlight = Math.max(0, state.inFlight + delta);
}

function renderHistogram(
  metric: string,
  help: string,
  labels: string,
  buckets: number[],
  data: ToolCallStats
): string {
  const lines: string[] = [];
  lines.push(`# HELP ${metric} ${help}`);
  lines.push(`# TYPE ${metric} histogram`);
  let cumulative = 0;
  for (let i = 0; i < DURATION_BUCKETS.length; i++) {
    cumulative += buckets[i];
    lines.push(`${metric}${labels} le="${DURATION_BUCKETS[i]}" ${cumulative}`);
  }
  cumulative += buckets[DURATION_BUCKETS.length];
  lines.push(`${metric}${labels} le="+Inf" ${cumulative}`);
  lines.push(`${metric}_sum${labels} ${data.durationSum.toFixed(6)}`);
  lines.push(`${metric}_count${labels} ${data.total}`);
  return lines.join('\n');
}

/**
 * @name renderMetrics
 * @description Serializes the current metric state in Prometheus text exposition format.
 */
export function renderMetrics(): string {
  const blocks: string[] = [];

  blocks.push('# HELP sap_mcp_uptime_seconds Server uptime in seconds.');
  blocks.push('# TYPE sap_mcp_uptime_seconds gauge');
  blocks.push(`sap_mcp_uptime_seconds ${((Date.now() - state.startedAt) / 1000).toFixed(1)}`);

  blocks.push('# HELP sap_mcp_tool_calls_in_flight Number of tool calls currently executing.');
  blocks.push('# TYPE sap_mcp_tool_calls_in_flight gauge');
  blocks.push(`sap_mcp_tool_calls_in_flight ${state.inFlight}`);

  blocks.push('# HELP sap_mcp_tool_calls_total Total tool invocations by tool and status.');
  blocks.push('# TYPE sap_mcp_tool_calls_total counter');
  for (const [tool, stats] of state.toolCalls) {
    blocks.push(`sap_mcp_tool_calls_total{tool="${tool}",status="ok"} ${stats.ok}`);
    blocks.push(`sap_mcp_tool_calls_total{tool="${tool}",status="error"} ${stats.error}`);
  }

  blocks.push('# HELP sap_mcp_requests_total Total HTTP requests by endpoint and status.');
  blocks.push('# TYPE sap_mcp_requests_total counter');
  for (const [endpoint, entry] of state.requests) {
    blocks.push(`sap_mcp_requests_total{endpoint="${endpoint}",status="ok"} ${entry.ok}`);
    blocks.push(`sap_mcp_requests_total{endpoint="${endpoint}",status="error"} ${entry.error}`);
  }

  for (const [tool, stats] of state.toolCalls) {
    blocks.push(
      renderHistogram(
        'sap_mcp_tool_call_duration_seconds',
        'Tool call duration in seconds.',
        `{tool="${tool}"}`,
        stats.durationBucket,
        stats
      )
    );
  }

  return `${blocks.join('\n')}\n`;
}

/**
 * @name startMetricsExporter
 * @description Starts the Prometheus `/metrics` HTTP exporter on the given port.
 *
 * The exporter is independent of the MCP HTTP server so it can bind a dedicated
 * scrape port (default 9090) without affecting the MCP endpoint. Returns the
 * created HTTP server, or `null` when metrics are disabled.
 *
 * @param port — TCP port for the `/metrics` endpoint.
 */
export function startMetricsExporter(port: number): import('http').Server | null {
  if (!state.enabled) {
    return null;
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (url === '/metrics' || url === '/metrics/') {
        const body = renderMetrics();
        res.writeHead(200, {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }
      if (url === '/health' || url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok' }));
        return;
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  server.listen(port, () => {
    logger.info(`Prometheus metrics exporter listening on :${port}/metrics`);
  });

  return server;
}

/**
 * @name stopMetricsExporter
 * @description Stops a previously started metrics exporter server.
 */
export function stopMetricsExporter(server: import('http').Server | null): void {
  if (server) {
    server.close();
  }
}
