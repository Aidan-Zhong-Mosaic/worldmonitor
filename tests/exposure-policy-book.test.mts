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

/** A stand-in for the MCP server. Rows are invented; only the shape is real. */
function fakeClient(pages: Array<Array<Record<string, unknown>>>, opts: { structured?: boolean } = {}) {
  const sent: string[] = [];
  const columns = POLICY_BOOK_COLUMNS.map((c) => c.column);
  const client = {
    async callTool(name: string, args: Record<string, unknown>) {
      assert.equal(name, 'trino_execute_sql');
      const sql = String(args.sql);
      sent.push(sql);
      if (sql.includes('MAX(run_date)')) {
        return { content: [{ type: 'text', text: JSON.stringify({ columns: ['run_date'], rows: [{ run_date: '2026-07-09' }], row_count: 1 }) }] };
      }
      const page = Number(/OFFSET (\d+)/.exec(sql)?.[1] ?? 0) / PAGE_SIZE;
      const rows = pages[page] ?? [];
      const payload = { columns, rows, row_count: rows.length };
      return opts.structured ? { structuredContent: payload } : { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    },
  };
  return { client: client as unknown as RbsMcpClient, sent };
}

const invented = (n: number, over: Record<string, unknown> = {}) =>
  Array.from({ length: n }, (_, i) => ({
    policylinekey: 1000 + i,
    policyactivitykey: 2000 + i,
    policykey: 3000 + i,
    policyno: `TEST-${i}`,
    servicecompany: 'Mosaic Test Entity',
    exp_policy_flag: 1,
    policystatus: 'Currently in Bound status',
    latest_line_status: 'Signed',
    inception_date: '2026-01-01 00:00:00',
    expiry_date: '2027-01-01 00:00:00',
    class_of_business: 'Political Violence',
    class_lob: 'War and Terrorism',
    lloyds_risk_code: 'TO',
    territory: 'Nigeria',
    insured_location: 'United Kingdom',
    insured: `Test Insured ${i}`,
    obligor: '',
    occupation_description: 'Energy',
    sector_description: 'D. ELECTRICITY',
    type_of_layer: 'Primary',
    limitbasis: 'In the Aggregate',
    mosaic1609_exposure_cnv_usd: '1500000.000000000000000000',
    sharelimit_cnv_usd: '3000000.000000000000000000',
    ...over,
  }));

describe('readPolicyBook', () => {
  it('pages until a short page, and reads the snapshot date', async () => {
    const { client, sent } = fakeClient([invented(PAGE_SIZE), invented(37)]);
    const book = await readPolicyBook(client, { table: TABLE, expiredOnOrAfter: '2025-09-22' });
    assert.equal(book.rows.length, PAGE_SIZE + 37);
    assert.equal(book.runDate, '2026-07-09');
    assert.equal(sent.length, 3, 'one run-date query, then two pages');
    assert.match(sent[1] ?? '', /OFFSET 0 LIMIT 100/);
    assert.match(sent[2] ?? '', /OFFSET 100 LIMIT 100/);
  });

  it('stops after one call when the first page is short', async () => {
    const { client, sent } = fakeClient([invented(4)]);
    assert.equal((await readPolicyBook(client, { table: TABLE, expiredOnOrAfter: '2025-09-22' })).rows.length, 4);
    assert.equal(sent.length, 2);
  });

  it('reads structured content as well as JSON text', async () => {
    const { client } = fakeClient([invented(2)], { structured: true });
    assert.equal((await readPolicyBook(client, { table: TABLE, expiredOnOrAfter: '2025-09-22' })).rows.length, 2);
  });

  it('keeps money as sent, so precision is not lost before it is parsed', async () => {
    const { client } = fakeClient([invented(1)]);
    const [row] = (await readPolicyBook(client, { table: TABLE, expiredOnOrAfter: '2025-09-22' })).rows;
    assert.equal(row?.mosaic1609_exposure_cnv_usd, '1500000.000000000000000000');
  });

  it('keeps only contract columns, whatever the server sends', async () => {
    const { client } = fakeClient([invented(1, { mosaic_share_gwp_cnv_usd: 99, territory: undefined })]);
    const [row] = (await readPolicyBook(client, { table: TABLE, expiredOnOrAfter: '2025-09-22' })).rows;
    assert.ok(row && !('mosaic_share_gwp_cnv_usd' in row), 'premium column must not reach the app');
    assert.equal(row?.territory, null, 'a missing column becomes null, not undefined');
  });

  it('fails loudly on an error, a non-JSON reply, or a missing column', async () => {
    const err = { callTool: async () => ({ isError: true, content: [{ type: 'text', text: 'table not found' }] }) };
    await assert.rejects(readPolicyBook(err as unknown as RbsMcpClient, { table: TABLE, expiredOnOrAfter: '2025-09-22' }), /table not found/);

    const junk = { callTool: async () => ({ content: [{ type: 'text', text: 'Query OK' }] }) };
    await assert.rejects(readPolicyBook(junk as unknown as RbsMcpClient, { table: TABLE, expiredOnOrAfter: '2025-09-22' }), /did not return JSON/);

    const short = {
      callTool: async (_n: string, a: Record<string, unknown>) => String(a.sql).includes('MAX(run_date)')
        ? { content: [{ type: 'text', text: JSON.stringify({ rows: [{ run_date: '2026-07-09' }] }) }] }
        : { content: [{ type: 'text', text: JSON.stringify({ columns: ['policylinekey'], rows: [] }) }] },
    };
    await assert.rejects(readPolicyBook(short as unknown as RbsMcpClient, { table: TABLE, expiredOnOrAfter: '2025-09-22' }), /Columns missing/);
  });

  it('reads only the pages asked for, and says the book is incomplete', async () => {
    const { client, sent } = fakeClient(Array.from({ length: 10 }, () => invented(PAGE_SIZE)));
    const book = await readPolicyBook(client, { table: TABLE, expiredOnOrAfter: '2025-09-22', pages: 2 });
    assert.equal(book.rows.length, 2 * PAGE_SIZE);
    assert.equal(book.truncated, true);
    assert.equal(sent.length, 3);
  });

  it('marks a complete read as complete', async () => {
    const { client } = fakeClient([invented(5)]);
    assert.equal((await readPolicyBook(client, { table: TABLE, expiredOnOrAfter: '2025-09-22' })).truncated, false);
  });

  it('refuses to loop forever', async () => {
    const { client } = fakeClient(Array.from({ length: 10 }, () => invented(PAGE_SIZE)));
    await assert.rejects(
      readPolicyBook(client, { table: TABLE, expiredOnOrAfter: '2025-09-22', maxPages: 3 }),
      /Stopped after 3 pages/,
    );
  });
});
