/**
 * Read the policy book through the MCP server and report what came back.
 *
 *   npx tsx scripts/exposure/read-policy-book.mts            # first 2 pages, a quick check
 *   npx tsx scripts/exposure/read-policy-book.mts --all      # the whole book (~127 calls)
 *
 * Prints counts only — no policy references, insured names or amounts — so the
 * output is safe to share. Reads configuration from .env.local or .env.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { policyBookTableFromEnv, readPolicyBook } from '../../server/_shared/exposure/policy-book.ts';
import { RbsMcpClient, readRbsMcpConfig } from '../../server/_shared/exposure/rbs-mcp-client.ts';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
for (const file of ['.env.local', '.env']) {
  const path = join(repoRoot, file);
  if (existsSync(path)) process.loadEnvFile(path);
}

const all = process.argv.includes('--all');
const lookback = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const client = new RbsMcpClient(readRbsMcpConfig());
const table = policyBookTableFromEnv();
console.log(`Table    : ${table}`);
console.log(`Reading  : policies whose cover ended on or after ${lookback}${all ? '' : ', first 2 pages only'}`);

const started = Date.now();
try {
  const book = await readPolicyBook(client, {
    table,
    expiredOnOrAfter: lookback,
    ...(all ? {} : { pages: 2 }),
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Book date: ${book.runDate ?? 'unknown'}`);
  console.log(`Rows     : ${book.rows.length.toLocaleString()}${book.truncated ? ' (partial)' : ''} in ${seconds}s\n`);

  const tally = (key: 'class_of_business' | 'territory') => {
    const counts = new Map<string, number>();
    for (const row of book.rows) {
      const value = String(row[key] ?? '(blank)');
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]);
  };

  console.log('By line of business:');
  for (const [name, n] of tally('class_of_business')) console.log(`   ${String(n).padStart(6)}  ${name}`);
  console.log('\nTop territories:');
  for (const [name, n] of tally('territory').slice(0, 10)) console.log(`   ${String(n).padStart(6)}  ${name}`);
} catch (err) {
  console.error(`\nFailed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
