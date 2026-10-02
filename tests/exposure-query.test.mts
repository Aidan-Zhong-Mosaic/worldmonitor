import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildExposureQuery,
  CANCELLED_POLICY_STATUSES,
  DEFAULT_ROW_LIMIT,
  POLICY_LINE_KEY,
  resolveTerritoryValues,
} from '../server/_shared/exposure/exposure-query.ts';
import { POLICY_BOOK_COLUMNS } from '../server/_shared/exposure/policy-book.ts';
import { TERRITORY_SCOPES } from '../shared/exposure/territory-scopes.ts';

const TABLE = 'redshift.silver.parallel_syndicate_rbs_report';

/** The happy path most tests start from: one country, nothing else narrowed. */
const build = (over: Partial<Parameters<typeof buildExposureQuery>[0]> = {}) =>
  buildExposureQuery({
    table: TABLE, eventId: 'evt-1', countries: ['CO'], asOf: '2026-09-28', ...over,
  });

const ok = (over: Partial<Parameters<typeof buildExposureQuery>[0]> = {}) => {
  const result = build(over);
  assert.equal(result.matchable, true, `expected a matchable query: ${JSON.stringify(result)}`);
  if (!result.matchable) throw new Error('unreachable');
  return result;
};

describe('territory resolution', () => {
  it('finds the wordings that cover a country', () => {
    const { covering } = resolveTerritoryValues(['CO']);
    assert.ok(covering.length > 0);
    assert.ok(covering.every((w) => w in TERRITORY_SCOPES), 'only real wordings');
  });

  it('never reports a wording as both covering and excluded', () => {
    const { covering, excluded, unresolved } = resolveTerritoryValues(['US']);
    for (const group of [excluded, unresolved]) {
      for (const wording of group) assert.ok(!covering.includes(wording), wording);
    }
  });

  it('treats a USA carve-out as an exclusion, not cover', () => {
    const carveOut = 'Worldwide with USA exclusions but no USA exposure';
    assert.ok(carveOut in TERRITORY_SCOPES, 'fixture wording still exists');
    assert.ok(resolveTerritoryValues(['US']).excluded.includes(carveOut));
    // The same wording DOES cover anywhere else in the world.
    assert.ok(resolveTerritoryValues(['CO']).covering.includes(carveOut));
  });

  it('keeps unresolved wordings separate so unknown cover is never dropped', () => {
    const { unresolved } = resolveTerritoryValues(['CO']);
    for (const wording of unresolved) {
      assert.equal(TERRITORY_SCOPES[wording]?.needsReview, true);
    }
  });

  it('is order-independent and deduplicates countries', () => {
    const a = resolveTerritoryValues(['CO', 'US']);
    const b = resolveTerritoryValues(['US', 'CO', 'US']);
    assert.deepEqual(new Set(a.covering), new Set(b.covering));
  });
});

describe('the row query', () => {
  it('selects exactly the contract columns', () => {
    const selected = ok().sql.split('\n')[0]?.replace(/^SELECT /, '').split(', ');
    assert.deepEqual(selected, POLICY_BOOK_COLUMNS.map((c) => c.column));
  });

  it('never selects a column outside the contract', () => {
    const forbidden = ['premium', 'gelr', 'underwriter_email', 'commission', 'expected_claims'];
    const { sql, countSql } = ok();
    for (const column of forbidden) {
      assert.ok(!sql.includes(column), `${column} must not appear`);
      assert.ok(!countSql.includes(column), `${column} must not appear`);
    }
  });

  it('pins one snapshot so exposure is not multiplied across run_dates', () => {
    assert.match(ok().sql, /run_date = \(SELECT MAX\(run_date\)/);
    assert.match(ok({ runDate: '2026-09-27' }).sql, /CAST\(run_date AS DATE\) = DATE '2026-09-27'/);
  });

  it('filters the reporting set and the in-force window', () => {
    const { sql } = ok();
    assert.ok(sql.includes("report_data = 'Yes'"));
    assert.ok(sql.includes("inception_date <= TIMESTAMP '2026-09-28 00:00:00'"));
    assert.ok(sql.includes("expiry_date >= TIMESTAMP '2026-09-28 00:00:00'"));
  });

  it('fails open on a missing date rather than hiding the line', () => {
    const { sql } = ok();
    assert.ok(sql.includes('inception_date IS NULL OR'));
    assert.ok(sql.includes('expiry_date IS NULL OR'));
  });

  it('excludes cancelled lines without dropping lines that have no status', () => {
    const { sql } = ok();
    assert.ok(sql.includes('policystatus IS NULL OR policystatus NOT IN'));
    for (const status of CANCELLED_POLICY_STATUSES) assert.ok(sql.includes(`'${status}'`));
  });

  it('does not filter on line status — rule 2 says show it, not gate on it', () => {
    assert.ok(!ok().sql.includes('latest_line_status IN'));
    assert.ok(!ok().sql.includes('latest_line_status ='));
  });

  it('omits an empty filter instead of emitting IN ()', () => {
    const { sql } = ok({ classesOfBusiness: [], riskCodes: [] });
    assert.ok(!sql.includes('IN ()'));
    assert.ok(!sql.includes('class_of_business IN'));
    assert.ok(!sql.includes('lloyds_risk_code IN'));
  });

  it('narrows by class of business and risk code when given them', () => {
    const { sql } = ok({ classesOfBusiness: ['Political Risk'], riskCodes: ['TE', 'NA'] });
    assert.ok(sql.includes("class_of_business IN ('Political Risk')"));
    assert.ok(sql.includes("lloyds_risk_code IN ('TE', 'NA')"));
  });

  it('orders by exposure then by the unique line key, and limits', () => {
    const { sql } = ok();
    assert.ok(sql.includes('ORDER BY mosaic1609_exposure_cnv_usd DESC NULLS LAST'));
    assert.ok(sql.includes(POLICY_LINE_KEY.join(', ')), 'tie-break is deterministic');
    assert.ok(sql.endsWith(`LIMIT ${DEFAULT_ROW_LIMIT}`));
    assert.ok(ok({ rowLimit: 25 }).sql.endsWith('LIMIT 25'));
  });
});

describe('the totals query', () => {
  it('shares the row query WHERE exactly, so the figures match the list', () => {
    const { sql, countSql } = ok({ classesOfBusiness: ['Political Risk'] });
    const clauseOf = (q: string) => q.slice(q.indexOf('\nWHERE '), q.indexOf('\nORDER BY ') + 1 || undefined);
    const rowWhere = sql.slice(sql.indexOf('\nWHERE '), sql.indexOf('\nORDER BY '));
    assert.ok(countSql.includes(rowWhere.trim()), 'count query carries the same predicate');
    assert.ok(clauseOf(countSql).length > 0);
  });

  it('sums both money columns and has no LIMIT', () => {
    const { countSql } = ok();
    assert.ok(countSql.includes('SUM(mosaic1609_exposure_cnv_usd) AS net_exposure_usd'));
    assert.ok(countSql.includes('SUM(sharelimit_cnv_usd) AS share_limit_usd'));
    assert.ok(countSql.includes('COUNT(*) AS lines'));
    assert.ok(!countSql.includes('LIMIT'), 'totals must not be truncated');
    assert.ok(!countSql.includes('ORDER BY'));
  });
});

describe('refusing to run', () => {
  it('will not build a query for an event with no country', () => {
    const result = build({ countries: [] });
    assert.equal(result.matchable, false);
    if (result.matchable) throw new Error('unreachable');
    assert.match(result.reason, /names no country/);
  });

  it('rejects anything that would be interpolated unchecked', () => {
    assert.throws(() => build({ table: "x'; DROP TABLE y--" }), /valid Trino table/);
    assert.throws(() => build({ asOf: '28-09-2026' }), /YYYY-MM-DD/);
    assert.throws(() => build({ runDate: 'yesterday' }), /YYYY-MM-DD/);
    assert.throws(() => build({ countries: ['Colombia'] }), /alpha-2/);
    assert.throws(() => build({ rowLimit: 0 }), /between 1 and 10000/);
    assert.throws(() => build({ rowLimit: 1.5 }), /between 1 and 10000/);
    assert.throws(() => build({ classesOfBusiness: ['a\nb'] }), /usable filter value/);
  });

  it('escapes an apostrophe in a filter value instead of breaking the literal', () => {
    const { sql } = ok({ classesOfBusiness: ["Lloyd's Cover"] });
    assert.ok(sql.includes("'Lloyd''s Cover'"));
  });

  it('quotes every territory wording it emits', () => {
    const { sql } = ok();
    const inList = sql.slice(sql.indexOf('territory IN ('));
    assert.ok(!/territory IN \([^']/.test(inList), 'no bare value in the IN list');
  });
});

describe('the trace', () => {
  it('tells the panel what was tested and what was not', () => {
    const { trace } = ok();
    assert.equal(trace.eventId, 'evt-1');
    assert.deepEqual(trace.countries, ['CO']);
    assert.ok(trace.notes.some((n) => /territory wordings cover Colombia/.test(n)));
    assert.ok(trace.notes.some((n) => /Line status is not filtered/.test(n)));
    assert.ok(trace.limitations.some((l) => /Peril is not tested/.test(l)));
    assert.ok(trace.limitations.some((l) => /internal classification columns/.test(l)));
    assert.ok(trace.limitations.some((l) => /Insured and obligor are displayed but not matched/.test(l)));
  });

  it('reports worldwide exclusions, which is how an underwriter trusts the count', () => {
    const { trace } = ok({ countries: ['US'] });
    assert.ok(trace.territory.excluded.length > 0);
    assert.ok(trace.notes.some((n) => /worldwide wordings exclude .* and were left out/.test(n)));
  });

  it('says which snapshot the figures came from', () => {
    assert.ok(ok({ runDate: '2026-09-27' }).trace.notes.some((n) => n.includes('pinned to 2026-09-27')));
    assert.ok(ok().trace.notes.some((n) => /latest run_date/.test(n)));
  });

  it('carries no policy data — only the event side and the rules', () => {
    // Structural, not a substring scan: the trace is written to the database and
    // returned to the browser, so its shape is the guarantee. "insured" appears
    // in the limitation prose, which is why this checks keys rather than text.
    assert.deepEqual(Object.keys(ok().trace).sort(), [
      'asOf', 'classesOfBusiness', 'countries', 'eventId', 'insuredLocations',
      'limitations', 'notes', 'riskCodes', 'runDate', 'territory',
    ]);
    // insuredLocations holds country names we asked for, never a value read back.
    assert.deepEqual(ok().trace.insuredLocations, ['Colombia']);
    const serialized = JSON.stringify(ok().trace);
    for (const leak of ['policyno', 'mosaic1609', 'sharelimit', 'policylinekey']) {
      assert.ok(!serialized.includes(leak), `${leak} must not be in the trace`);
    }
  });
});
