import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPolicyBookPageSql,
  buildRunDateSql,
  PAGE_SIZE,
  POLICY_BOOK_COLUMNS,
  policyBookTableFromEnv,
  readPolicyBook,
} from '../server/_shared/exposure/policy-book.ts';
import type { RbsMcpClient } from '../server/_shared/exposure/rbs-mcp-client.ts';

const TABLE = 'rbs.public.parallel_syndicate_rbs_report';
const sql = (page = 0) => buildPolicyBookPageSql({ table: TABLE, expiredOnOrAfter: '2025-09-22', page });

describe('policy book data contract', () => {
  it('selects exactly the contract columns, nothing else', () => {
    const selected = sql().split('\n')[0]?.replace(/^SELECT /, '').split(', ');
    assert.deepEqual(selected, POLICY_BOOK_COLUMNS.map((c) => c.column));
    assert.equal(new Set(selected).size, selected?.length, 'no duplicates');
  });

  it('never reads pricing, commission, claims, broker or staff columns', () => {
    // A guard for future edits: anyone adding one of these must remove this test on purpose.
    const forbidden = /premium|gwp|commission|brokerage|gelr|loss_ratio|expected_claims|broker|underwriter|email|peer_review|entry_checked|revenue|employees|enterprisevalue|assetsunder/i;
    for (const { column } of POLICY_BOOK_COLUMNS) assert.doesNotMatch(column, forbidden, column);
  });

  it('documents why every column is read', () => {
    for (const { column, use } of POLICY_BOOK_COLUMNS) assert.ok(use.length > 5, `${column} has no stated use`);
  });
});

describe('buildPolicyBookPageSql', () => {
  it('reads the reporting set within the lookback window', () => {
    assert.match(sql(), /WHERE report_data = 'Yes'/);
    assert.match(sql(), /expiry_date >= TIMESTAMP '2025-09-22 00:00:00'/);
  });

  it('pages in 100s over a unique key, so nothing is skipped or repeated', () => {
    assert.equal(PAGE_SIZE, 100);
    assert.match(sql(0), /ORDER BY policylinekey, servicecompany, exp_policy_flag, policyactivitykey\nOFFSET 0 LIMIT 100$/);
    assert.match(sql(3), /OFFSET 300 LIMIT 100$/);
  });

  it('refuses anything that could alter the SQL', () => {
    for (const table of ['x; DROP TABLE y', 'a b.c', "rbs.public.t'--", 'onlyonepart']) {
      assert.throws(() => buildPolicyBookPageSql({ table, expiredOnOrAfter: '2025-09-22', page: 0 }), /table name/);
    }
    assert.throws(() => buildPolicyBookPageSql({ table: TABLE, expiredOnOrAfter: "2025-09-22' OR 1=1", page: 0 }), /date/);
    assert.throws(() => buildPolicyBookPageSql({ table: TABLE, expiredOnOrAfter: '2025-09-22', page: -1 }), /Page/);
  });

  it('builds the snapshot-date query', () => {
    assert.equal(buildRunDateSql(TABLE), `SELECT MAX(run_date) AS run_date FROM ${TABLE} WHERE report_data = 'Yes'`);
  });
});

describe('policyBookTableFromEnv', () => {
  it('reads and validates EXPOSURE_RBS_TABLE', () => {
    assert.equal(policyBookTableFromEnv({ EXPOSURE_RBS_TABLE: ` ${TABLE} ` }), TABLE);
    assert.throws(() => policyBookTableFromEnv({}), /EXPOSURE_RBS_TABLE is not set/);
  });
});

describe('readPolicyBook', () => {
  it('says plainly that it is not wired yet', async () => {
    await assert.rejects(
      readPolicyBook({} as RbsMcpClient, { table: TABLE, expiredOnOrAfter: '2025-09-22' }),
      /not wired yet/,
    );
  });
});
