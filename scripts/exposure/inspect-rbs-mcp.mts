/**
 * Inspect the RBS MCP server: connect, then list the tools it offers.
 *
 *   npx tsx scripts/exposure/inspect-rbs-mcp.mts
 *
 * Reads EXPOSURE_MCP_URL, EXPOSURE_MCP_PSK and EXPOSURE_MCP_AUTH_HEADER from
 * .env.local or .env at the repo root. Read-only: it lists tools and never calls
 * one. It prints no secrets, so its output is safe to share.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RbsMcpClient,
  RbsMcpConfigError,
  RbsMcpError,
  readRbsMcpConfig,
} from '../../server/_shared/exposure/rbs-mcp-client.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
for (const file of ['.env.local', '.env']) {
  const path = join(repoRoot, file);
  if (existsSync(path)) process.loadEnvFile(path); // earlier files win
}

const indent = (text: string, n: number): string =>
  text.split('\n').map((line) => ' '.repeat(n) + line).join('\n');

let config;
try {
  config = readRbsMcpConfig();
} catch (err) {
  if (err instanceof RbsMcpConfigError) {
    console.error(`Not configured: ${err.message}`);
    process.exit(1);
  }
  throw err;
}

console.log(`Server : ${config.url.origin}${config.url.pathname}`);
console.log(`Auth   : key sent in the "${config.authHeader}" header (value not shown)`);
if (config.url.protocol === 'http:') {
  console.log('Note   : plain http — the key crosses the network unencrypted. Prefer https if the server offers it.');
}

const client = new RbsMcpClient(config);
try {
  const info = await client.connect();
  console.log(`Server : ${info.name ?? 'unnamed'} ${info.version ?? ''} (MCP protocol ${info.protocolVersion ?? 'unknown'})`);

  const tools = await client.listTools();
  console.log(`\n${tools.length} tool(s)\n`);
  for (const tool of tools) {
    console.log(`• ${tool.name}`);
    if (tool.description) console.log(indent(tool.description.trim(), 4));
    const props = tool.inputSchema?.properties ?? {};
    const required = new Set(tool.inputSchema?.required ?? []);
    for (const [key, spec] of Object.entries(props)) {
      const optional = required.has(key) ? '' : ' (optional)';
      const about = spec.description ? ` — ${spec.description}` : '';
      console.log(`      ${key}: ${spec.type ?? 'any'}${optional}${about}`);
    }
    console.log('');
  }
} catch (err) {
  if (!(err instanceof RbsMcpError)) throw err;
  console.error(`\nFailed: ${err.message}`);
  const hint =
    /ENOTFOUND|EAI_AGAIN/.test(err.message) ? 'The hostname does not resolve. Are you on the VPN / corporate network?'
    : /ECONNREFUSED/.test(err.message) ? 'Nothing is listening at that address and port.'
    : /timed out|ETIMEDOUT/.test(err.message) ? 'No answer. Usually VPN or a firewall between you and the server.'
    : err.status === 404 || err.status === 405 ? 'Wrong path — or the server speaks the older SSE transport (its URL often ends in /sse).'
    : null;
  if (hint) console.error(`Hint  : ${hint}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
