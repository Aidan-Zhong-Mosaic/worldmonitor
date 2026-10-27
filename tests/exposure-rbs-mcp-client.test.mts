import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import {
  RbsMcpClient,
  RbsMcpConfigError,
  RbsMcpError,
  readRbsMcpConfig,
} from '../server/_shared/exposure/rbs-mcp-client.ts';

const KEY = 'test-key-not-real';

/** A minimal Streamable-HTTP MCP server: one session, tools/list answered as SSE. */
function fakeMcpServer() {
  const seen: Array<{ method: string; session: string | undefined }> = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'DELETE') { res.writeHead(204).end(); return; }
    if (req.headers['authorization-psk'] !== KEY) { res.writeHead(401).end(); return; }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const msg = JSON.parse(raw) as { id?: number; method: string };
    const session = req.headers['mcp-session-id'] as string | undefined;
    seen.push({ method: msg.method, session });

    if (msg.method === 'initialize') {
      res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'fake-rbs', version: '0.1' },
      } }));
    } else if (msg.method === 'notifications/initialized') {
      res.writeHead(202).end();
    } else if (session !== 'sess-1') {
      res.writeHead(400).end();
    } else if (msg.method === 'tools/list') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {
        tools: [{ name: 'trino_execute_sql', description: 'Run read-only SQL', inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } }],
      } })}\n\n`);
    } else if (msg.method === 'tools/call') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: '26331' }] } }));
    } else {
      res.writeHead(404).end();
    }
  });
  return { server, seen };
}

const listen = (s: Server) => new Promise<string>((resolve) => {
  s.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(s.address() as AddressInfo).port}/mcp`));
});

describe('RBS MCP client against a fake server', () => {
  const { server, seen } = fakeMcpServer();
  let url = '';
  before(async () => { url = await listen(server); });
  after(() => { server.close(); });

  const client = (psk = KEY) =>
    new RbsMcpClient(readRbsMcpConfig({ EXPOSURE_MCP_URL: url, EXPOSURE_MCP_PSK: psk }));

  it('performs the handshake, then lists tools over an SSE reply', async () => {
    const c = client();
    const info = await c.connect();
    assert.equal(info.name, 'fake-rbs');
    const tools = await c.listTools();
    assert.deepEqual(tools.map((t) => t.name), ['trino_execute_sql']);
    assert.deepEqual(seen.slice(0, 3).map((s) => s.method), ['initialize', 'notifications/initialized', 'tools/list']);
    assert.equal(seen[2]?.session, 'sess-1', 'session id must be carried after initialize');
    await c.close();
  });

  it('calls a tool and returns its result', async () => {
    const c = client();
    const result = await c.callTool('trino_execute_sql', { sql: 'SELECT 1' });
    assert.equal(result.content?.[0]?.text, '26331');
    await c.close();
  });

  it('refuses write tools before any request is sent', async () => {
    const callsBefore = seen.filter((s) => s.method === 'tools/call').length;
    for (const tool of ['trino_insert_rows', 'trino_overwrite_rows', 'trino_execute_statement']) {
      await assert.rejects(client().callTool(tool, {}), (err: unknown) =>
        err instanceof RbsMcpError && /read-only/.test(err.message));
    }
    assert.equal(seen.filter((s) => s.method === 'tools/call').length, callsBefore);
  });

  it('reports a rejected key without ever including the key', async () => {
    const wrong = 'wrong-key-should-never-appear';
    await assert.rejects(client(wrong).listTools(), (err: unknown) => {
      assert.ok(err instanceof RbsMcpError);
      assert.equal(err.status, 401);
      assert.ok(!err.message.includes(wrong));
      return true;
    });
  });
});

describe('RBS MCP client never follows redirects', () => {
  let hitsOnTarget = 0;
  const target = createServer((_req, res) => { hitsOnTarget++; res.writeHead(200).end('{}'); });
  let redirector: Server;
  let url = '';
  before(async () => {
    const targetUrl = await listen(target);
    redirector = createServer((_req, res) => { res.writeHead(307, { location: targetUrl }).end(); });
    url = await listen(redirector);
  });
  after(() => { target.close(); redirector.close(); });

  it('refuses a redirect instead of sending the key to another address', async () => {
    const c = new RbsMcpClient(readRbsMcpConfig({ EXPOSURE_MCP_URL: url, EXPOSURE_MCP_PSK: KEY }));
    await assert.rejects(c.connect(), (err: unknown) => err instanceof RbsMcpError && err.status === 307);
    assert.equal(hitsOnTarget, 0);
  });
});

describe('readRbsMcpConfig', () => {
  it('names the missing variable', () => {
    assert.throws(() => readRbsMcpConfig({ EXPOSURE_MCP_PSK: 'k' }), (e: unknown) =>
      e instanceof RbsMcpConfigError && /EXPOSURE_MCP_URL/.test(e.message));
    assert.throws(() => readRbsMcpConfig({ EXPOSURE_MCP_URL: 'https://x.test/mcp' }), (e: unknown) =>
      e instanceof RbsMcpConfigError && /EXPOSURE_MCP_PSK/.test(e.message));
  });

  it('defaults the key header to Authorization-PSK and allows overriding it', () => {
    const base = { EXPOSURE_MCP_URL: 'https://x.test/mcp', EXPOSURE_MCP_PSK: 'k' };
    assert.equal(readRbsMcpConfig(base).authHeader, 'Authorization-PSK');
    assert.equal(readRbsMcpConfig({ ...base, EXPOSURE_MCP_AUTH_HEADER: 'Authorization' }).authHeader, 'Authorization');
  });

  it('rejects non-http URLs and multi-line values', () => {
    assert.throws(() => readRbsMcpConfig({ EXPOSURE_MCP_URL: 'ftp://x.test', EXPOSURE_MCP_PSK: 'k' }), RbsMcpConfigError);
    assert.throws(() => readRbsMcpConfig({ EXPOSURE_MCP_URL: 'https://x.test', EXPOSURE_MCP_PSK: 'a\nb' }), RbsMcpConfigError);
  });
});
