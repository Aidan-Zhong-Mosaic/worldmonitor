/**
 * RBS MCP client — server-side access to Mosaic's policy database for Exposure Lens.
 *
 * Talks to the internal MCP server that fronts `parallel_syndicate_rbs_report`.
 *
 * SERVER-SIDE ONLY. It sends a pre-shared key, so nothing under src/ may import
 * this file, and none of its variables may carry a VITE_ prefix (Vite ships
 * VITE_* variables to every browser).
 *
 * Configuration — set in .env (gitignored), never committed:
 *   EXPOSURE_MCP_URL          Streamable HTTP endpoint of the MCP server
 *   EXPOSURE_MCP_PSK          the pre-shared key
 *   EXPOSURE_MCP_AUTH_HEADER  header that carries the key (default "Authorization-PSK")
 *
 * Protocol: MCP over Streamable HTTP (2025-03-26), spoken directly with fetch —
 * the same approach as api/mcp-proxy.ts, so there is no SDK dependency.
 *   1. POST initialize                → the server may issue an Mcp-Session-Id
 *   2. POST notifications/initialized
 *   3. POST tools/list, tools/call …  each carrying that session id
 */

const PROTOCOL_VERSION = '2025-03-26';

/**
 * The only tools this client will call. The server also offers tools that create,
 * insert, overwrite and merge tables; Exposure Lens only ever reads, so any other
 * name is refused before a request leaves the process.
 */
export const READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'trino_execute_sql', // SELECT / WITH / SHOW / DESCRIBE only, enforced by the server too
  'trino_validate_sql',
  'trino_list_catalogs',
  'trino_list_schemas',
  'trino_list_tables',
  'trino_table_columns',
  'trino_table_sample',
]);
const DEFAULT_AUTH_HEADER = 'Authorization-PSK';
const DEFAULT_TIMEOUT_MS = 30_000;

export interface RbsMcpConfig {
  url: URL;
  authHeader: string;
  psk: string;
  timeoutMs: number;
}

export interface McpServerInfo {
  name?: string;
  version?: string;
  protocolVersion?: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
}

export interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

/** Configuration is missing or malformed. The message names the variable to fix. */
export class RbsMcpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RbsMcpConfigError';
  }
}

/** The server could not be reached, or answered with an error. Never contains the key. */
export class RbsMcpError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'RbsMcpError';
    this.status = status;
  }
}

/** Read the connection settings from the environment, failing with a fix-it message. */
export function readRbsMcpConfig(env: Record<string, string | undefined> = process.env): RbsMcpConfig {
  const rawUrl = env.EXPOSURE_MCP_URL?.trim();
  const psk = env.EXPOSURE_MCP_PSK?.trim();
  const authHeader = env.EXPOSURE_MCP_AUTH_HEADER?.trim() || DEFAULT_AUTH_HEADER;

  if (!rawUrl) throw new RbsMcpConfigError('EXPOSURE_MCP_URL is not set — add the MCP server URL to .env');
  if (!psk) throw new RbsMcpConfigError('EXPOSURE_MCP_PSK is not set — add the pre-shared key to .env');

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RbsMcpConfigError('EXPOSURE_MCP_URL is not a valid URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new RbsMcpConfigError('EXPOSURE_MCP_URL must start with https:// (or http:// on an internal network)');
  }
  if (/[\r\n]/.test(authHeader) || /[\r\n]/.test(psk)) {
    throw new RbsMcpConfigError('EXPOSURE_MCP_AUTH_HEADER and EXPOSURE_MCP_PSK must each be a single line');
  }
  return { url, authHeader, psk, timeoutMs: DEFAULT_TIMEOUT_MS };
}

interface JsonRpcMessage {
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export class RbsMcpClient {
  private readonly config: RbsMcpConfig;
  private sessionId: string | null = null;
  private nextId = 1;
  private ready: Promise<McpServerInfo> | null = null;

  constructor(config: RbsMcpConfig) {
    this.config = config;
  }

  /** Perform the MCP handshake once; later calls reuse it. A failed handshake can be retried. */
  connect(): Promise<McpServerInfo> {
    if (!this.ready) {
      this.ready = this.handshake().catch((err: unknown) => {
        this.ready = null;
        throw err;
      });
    }
    return this.ready;
  }

  async listTools(): Promise<McpTool[]> {
    await this.connect();
    const result = await this.request<{ tools?: McpTool[] }>('tools/list', {});
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    if (!READ_ONLY_TOOLS.has(name)) {
      throw new RbsMcpError(`Refusing to call "${name}": Exposure Lens only uses read-only tools`);
    }
    await this.connect();
    return this.request<McpToolResult>('tools/call', { name, arguments: args });
  }

  /** End the session on the server. Best effort — not every server supports it. */
  async close(): Promise<void> {
    if (this.sessionId) {
      try {
        const resp = await fetch(this.config.url, {
          method: 'DELETE',
          headers: this.headers(),
          redirect: 'manual',
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
        await resp.body?.cancel();
      } catch {
        /* best effort */
      }
    }
    this.sessionId = null;
    this.ready = null;
  }

  private async handshake(): Promise<McpServerInfo> {
    const result = await this.request<{
      protocolVersion?: string;
      serverInfo?: { name?: string; version?: string };
    }>('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'worldmonitor-exposure-lens', version: '1.0' },
    });
    await this.notify('notifications/initialized');
    return {
      name: result.serverInfo?.name,
      version: result.serverInfo?.version,
      protocolVersion: result.protocolVersion,
    };
  }

  private async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    const resp = await this.post({ jsonrpc: '2.0', id, method, params });
    const issued = resp.headers.get('mcp-session-id');
    if (issued) this.sessionId = issued;
    const message = await readJsonRpc(resp, id);
    if (message.error) {
      throw new RbsMcpError(`${method} failed: ${message.error.message ?? 'unknown error'}`);
    }
    return message.result as T;
  }

  private async notify(method: string): Promise<void> {
    const resp = await this.post({ jsonrpc: '2.0', method, params: {} });
    await resp.body?.cancel(); // servers answer notifications with 202 and no body
  }

  private async post(body: unknown): Promise<Response> {
    let resp: Response;
    try {
      resp = await fetch(this.config.url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        // Never follow redirects: following one would re-send the key to wherever it points.
        redirect: 'manual',
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err) {
      throw new RbsMcpError(`Could not reach ${this.config.url.host}: ${describeNetworkError(err)}`);
    }
    if (resp.status >= 300 && resp.status < 400) {
      await resp.body?.cancel();
      throw new RbsMcpError(
        `Server redirected (HTTP ${resp.status}); set EXPOSURE_MCP_URL to the final address`,
        resp.status,
      );
    }
    if (resp.status === 401 || resp.status === 403) {
      await resp.body?.cancel();
      throw new RbsMcpError(
        `Server rejected the key (HTTP ${resp.status}); check EXPOSURE_MCP_PSK and EXPOSURE_MCP_AUTH_HEADER`,
        resp.status,
      );
    }
    if (!resp.ok) {
      await resp.body?.cancel();
      throw new RbsMcpError(`HTTP ${resp.status} from ${this.config.url.host}`, resp.status);
    }
    return resp;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      [this.config.authHeader]: this.config.psk,
    };
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId;
    return h;
  }
}

/** Build a client from the environment. Throws RbsMcpConfigError if anything is missing. */
export function createRbsMcpClient(env?: Record<string, string | undefined>): RbsMcpClient {
  return new RbsMcpClient(readRbsMcpConfig(env));
}

/**
 * A reply is either plain JSON or a server-sent event stream whose `data:`
 * lines carry JSON-RPC messages. Return the message answering request `id`.
 */
async function readJsonRpc(resp: Response, id: number): Promise<JsonRpcMessage> {
  const type = resp.headers.get('content-type') ?? '';
  const text = await resp.text();
  const messages: JsonRpcMessage[] = [];

  if (type.includes('text/event-stream')) {
    for (const event of text.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) continue;
      try {
        messages.push(JSON.parse(data) as JsonRpcMessage);
      } catch {
        /* keep-alive or non-JSON event */
      }
    }
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new RbsMcpError('Server replied with something that is not JSON');
    }
    messages.push(...((Array.isArray(parsed) ? parsed : [parsed]) as JsonRpcMessage[]));
  }

  const match = messages.find((m) => m.id === id)
    ?? messages.find((m) => m.result !== undefined || m.error !== undefined);
  if (!match) throw new RbsMcpError('Server reply contained no JSON-RPC result');
  return match;
}

function describeNetworkError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError') return 'timed out';
    const code = (err as { cause?: { code?: unknown } }).cause?.code;
    if (typeof code === 'string') return code; // ENOTFOUND, ECONNREFUSED, …
    return err.message;
  }
  return String(err);
}
