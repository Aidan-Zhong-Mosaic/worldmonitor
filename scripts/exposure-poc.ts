/**
 * Exposure Lens proof of concept — command-line view.
 *
 *   node --experimental-strip-types scripts/exposure-poc.ts
 *
 * Runs the seeded demo events against the synthetic demo portfolio, using the
 * same core the dashboard panel uses. Every line of business is covered.
 */

import { readFileSync } from 'node:fs';
import {
  MATCHERS, buildModelPayload, matchPolicy, matcherFor, normalizePolicy,
  parsePortfolioTsv, readableColumns, refusedColumns, FIELD_MANIFEST,
} from '../shared/exposure/exposure-core.ts';
import { DEMO_EVENTS } from '../shared/exposure/demo-events.ts';

const PORTFOLIO = process.argv[2] ?? 'public/exposure-demo/portfolio.tsv';
const rows = parsePortfolioTsv(readFileSync(PORTFOLIO, 'utf8'));
const policies = rows.map((r, i) => normalizePolicy(r, r['Policy Reference'] || `ROW-${i + 1}`));

const line = (c = '─') => console.log(c.repeat(78));
const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

line('═');
console.log('EXPOSURE LENS — DEMO PORTFOLIO');
line('═');
console.log(`\n${policies.length} policies · ${Object.keys(rows[0] ?? {}).length} columns · ${MATCHERS.length} matchers registered\n`);

const byLob = new Map<string, number>();
for (const p of policies) byLob.set(p.lob, (byLob.get(p.lob) ?? 0) + 1);
for (const [lob, n] of [...byLob].sort()) {
  const m = matcherFor(policies.find((p) => p.lob === lob)!);
  console.log(`  ${String(n).padStart(3)}  ${lob.padEnd(26)} → ${m ? m.label : 'NO MATCHER'}`);
}

let totalCards = 0;
for (const event of DEMO_EVENTS) {
  const matches = policies.map((p) => matchPolicy(p, event));
  const hit = matches.filter((m) => m.matched);
  const req = buildModelPayload(matches, event);

  console.log(`\n\n${event.headline}`);
  console.log(`  ${event.peril} · ${event.countries.join(', ')} · ${event.occurredAt} · panel: ${event.sourcePanel}`);
  line();
  if (hit.length === 0) {
    console.log('  No exposure — nothing sent to the model.');
    continue;
  }
  totalCards++;
  console.log(`  ${hit.length} exposed · net ${money(req.payload.cohort.netExposureUsd)} of ${money(req.payload.cohort.aggregateLimitUsd)} limit`);
  console.log(`  lines: ${req.payload.cohort.lines.join(', ')}`);
  for (const m of hit.slice(0, 4)) {
    const why = m.reasons.filter((r) => r.passed).slice(-2).map((r) => r.detail).join(' · ');
    console.log(`    ${m.policy.ref.padEnd(12)} ${(m.policy.insuredName ?? m.policy.obligor ?? '').slice(0, 34).padEnd(36)} ${money(m.policy.netExposureUsd ?? 0).padStart(12)}`);
    console.log(`    ${''.padEnd(12)} ${why}`);
  }
  if (hit.length > 4) console.log(`    … and ${hit.length - 4} more`);
  console.log(`  → model sees tokens only: ${req.payload.cohort.insuredTokens.slice(0, 4).join(', ')}${req.payload.cohort.insuredTokens.length > 4 ? ' …' : ''}`);
}

console.log('\n');
line();
console.log(`  ${totalCards} of ${DEMO_EVENTS.length} demo events produced exposure.`);
console.log(`  Manifest: ${FIELD_MANIFEST.length} columns declared — ${readableColumns()} readable, ${refusedColumns()} refused, rest unreadable.`);
line('═');
