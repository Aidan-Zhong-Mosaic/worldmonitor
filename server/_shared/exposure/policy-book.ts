/**
 * Policy book — what Exposure Lens reads from RBS, and the one function that reads it.
 *
 * POLICY_BOOK_COLUMNS is the complete data contract: the only RBS columns this
 * feature ever selects (23 of 271). Premium, commission, loss ratios, expected
 * claims, brokers and staff names are never read, so they never leave the database.
 *
 * Source: public.parallel_syndicate_rbs_report, reached through the nx1 MCP server,
 * which queries it via Trino. SERVER-SIDE ONLY, like rbs-mcp-client.ts.
 */

import type { McpToolResult, RbsMcpClient } from './rbs-mcp-client';

export const POLICY_BOOK_COLUMNS = [
  // identity and grain: one row is a policy line per carrier
  { column: 'policylinekey', use: 'Policy line id; with servicecompany, the dedupe key' },
  { column: 'policyactivitykey', use: 'Completes the unique row key used for paging' },
  { column: 'policykey', use: "Policy id; groups a policy's lines" },
  { column: 'policyno', use: 'Policy reference shown to underwriters' },
  { column: 'servicecompany', use: 'Carrier; figures from different carriers are never added' },
  { column: 'exp_policy_flag', use: 'Tie-break when repeats of a line disagree (meaning assumed; see plan)' },
  // status and period: the in-force gate
  { column: 'policystatus', use: 'Excludes "Cancelled Mid Term"' },
  { column: 'latest_line_status', use: 'Signed or Bound' },
  { column: 'inception_date', use: 'Start of cover' },
  { column: 'expiry_date', use: 'End of cover' },
  // line of business and wording: which rules apply
  { column: 'class_of_business', use: 'Line of business; the panel scopes to the LOB chosen in the header' },
  { column: 'class_lob', use: 'Policy wording(s), comma-separated; peril rule (later)' },
  { column: 'lloyds_risk_code', use: 'Risk codes; corroboration (later)' },
  // geography: Rule 1
  { column: 'territory', use: 'Territorial scope; resolved through shared/exposure/territory-scopes.ts' },
  { column: 'insured_location', use: 'Insured domicile; context only, never used for location matching' },
  // entities: Rule 2 (later); only ever sent to a model as tokens
  { column: 'insured', use: 'Named insured' },
  { column: 'obligor', use: 'Obligor (Political Risk)' },
  // context shown on the card
  { column: 'occupation_description', use: 'Sector label' },
  { column: 'sector_description', use: "Lloyd's industrial sector" },
  { column: 'type_of_layer', use: 'Primary or excess' },
  { column: 'limitbasis', use: 'Aggregate or each and every loss' },
  // money: shown per line, never summed
  { column: 'mosaic1609_exposure_cnv_usd', use: 'Net exposure, our share, USD' },
  { column: 'sharelimit_cnv_usd', use: 'Limit, our share, USD' },
] as const;

export type PolicyBookColumn = (typeof POLICY_BOOK_COLUMNS)[number]['column'];

/** One RBS row as read. Values arrive however the MCP server serialises them; normalisation happens downstream. */
export type RbsPolicyRow = Record<PolicyBookColumn, string | number | null>;

export interface PolicyBook {
  /** RBS snapshot date, MAX(run_date). The panel shows it as the book date. */
  runDate: string | null;
  rows: RbsPolicyRow[];
  /** True when `pages` cut the read short, so this is not the whole book. */
  truncated: boolean;
}

/** The MCP server returns at most 100 rows per call, so the book is read in pages of this size. */
export const PAGE_SIZE = 100;

/** Unique across the reporting set with no blanks (checked 22 Sep 2026), so pages never skip or repeat a row. */
const ORDER_KEY = ['policylinekey', 'servicecompany', 'exp_policy_flag', 'policyactivitykey'] as const;

const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){1,2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface PolicyBookPage {
  /** Fully qualified Trino table: catalog.schema.table. */
  table: string;
  /** Policies whose cover ended before this date (YYYY-MM-DD) are not read. */
  expiredOnOrAfter: string;
  /** Zero-based page number. */
  page: number;
}

/** The SELECT for one page of the book. Everything interpolated is validated, since this is SQL. */
export function buildPolicyBookPageSql({ table, expiredOnOrAfter, page }: PolicyBookPage): string {
  assertTable(table);
  if (!ISO_DATE.test(expiredOnOrAfter)) throw new Error(`Not a YYYY-MM-DD date: "${expiredOnOrAfter}"`);
  if (!Number.isInteger(page) || page < 0) throw new Error(`Page must be a whole number ≥ 0, got ${page}`);
  return [
    `SELECT ${POLICY_BOOK_COLUMNS.map((c) => c.column).join(', ')}`,
    `FROM ${table}`,
    `WHERE report_data = 'Yes'`,
    `  AND expiry_date >= TIMESTAMP '${expiredOnOrAfter} 00:00:00'`,
    `ORDER BY ${ORDER_KEY.join(', ')}`,
    `OFFSET ${page * PAGE_SIZE} LIMIT ${PAGE_SIZE}`,
  ].join('\n');
}

/** The SELECT for the snapshot date. */
export function buildRunDateSql(table: string): string {
  assertTable(table);
  return `SELECT MAX(run_date) AS run_date FROM ${table} WHERE report_data = 'Yes'`;
}

/** Read the table name from EXPOSURE_RBS_TABLE. */
export function policyBookTableFromEnv(env: Record<string, string | undefined> = process.env): string {
  const table = env.EXPOSURE_RBS_TABLE?.trim();
  if (!table) throw new Error('EXPOSURE_RBS_TABLE is not set — add the Trino table name (catalog.schema.table) to .env');
  assertTable(table);
  return table;
}

/**
 * THE one function that reads RBS. Everything downstream depends only on its
 * return type.
 *
 * Reads the snapshot date, then pages through the book: the MCP server returns
 * at most PAGE_SIZE rows per call, so it asks for page 0, 1, 2 … until a page
 * comes back short. With a one-year lookback that is roughly 127 calls.
 *
 * Only columns in POLICY_BOOK_COLUMNS are kept, whatever the server sends.
 *
 * `pages` deliberately reads only the first N pages, for a quick check; the
 * result then says `truncated: true`. `maxPages` is the runaway guard: reaching
 * it is an error, never a silent partial book.
 */
export async function readPolicyBook(
  client: RbsMcpClient,
  { table, expiredOnOrAfter, pages, maxPages = 500 }: {
    table: string; expiredOnOrAfter: string; pages?: number; maxPages?: number;
  },
): Promise<PolicyBook> {
  const runDate = await readRunDate(client, table);
  const rows: RbsPolicyRow[] = [];

  const stopAfter = pages ?? maxPages;
  for (let page = 0; page < stopAfter; page++) {
    const sql = buildPolicyBookPageSql({ table, expiredOnOrAfter, page });
    const result = parseSqlResult(await client.callTool('trino_execute_sql', { sql }), `page ${page}`);
    assertContractColumns(result.columns);
    const batch = result.rows ?? [];
    for (const raw of batch) rows.push(toPolicyRow(raw));
    if (batch.length < PAGE_SIZE) return { runDate, rows, truncated: false };
  }
  if (pages !== undefined) return { runDate, rows, truncated: true };
  throw new Error(`Stopped after ${maxPages} pages (${rows.length} rows): the book is larger than expected`);
}

async function readRunDate(client: RbsMcpClient, table: string): Promise<string | null> {
  const result = parseSqlResult(await client.callTool('trino_execute_sql', { sql: buildRunDateSql(table) }), 'run date');
  const value = result.rows?.[0]?.run_date;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

interface SqlResult {
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
}

/**
 * trino_execute_sql answers with {"columns":[…],"rows":[{…}],"row_count":n},
 * either as structured content or as JSON in a text block.
 */
function parseSqlResult(result: McpToolResult, what: string): SqlResult {
  if (result.isError) {
    throw new Error(`Query failed (${what}): ${textOf(result) ?? 'no detail given'}`);
  }
  if (isSqlResult(result.structuredContent)) return result.structuredContent;

  const text = textOf(result);
  if (!text) throw new Error(`Query returned nothing readable (${what})`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Query did not return JSON (${what}): ${text.slice(0, 120)}`);
  }
  if (!isSqlResult(parsed)) throw new Error(`Query returned no rows array (${what})`);
  return parsed;
}

function textOf(result: McpToolResult): string | null {
  return result.content?.find((b) => b.type === 'text' && typeof b.text === 'string')?.text ?? null;
}

function isSqlResult(value: unknown): value is SqlResult {
  return typeof value === 'object' && value !== null && Array.isArray((value as SqlResult).rows);
}

/** Fail loudly if the table stops returning what the contract asks for. */
function assertContractColumns(columns: string[] | undefined): void {
  if (!columns) return;
  const expected = POLICY_BOOK_COLUMNS.map((c) => c.column);
  const missing = expected.filter((c) => !columns.includes(c));
  if (missing.length > 0) throw new Error(`Columns missing from the result: ${missing.join(', ')}`);
}

/** Keep only contract columns, so nothing outside it ever reaches the rest of the app. */
function toPolicyRow(raw: Record<string, unknown>): RbsPolicyRow {
  const row = {} as Record<string, string | number | null>;
  for (const { column } of POLICY_BOOK_COLUMNS) {
    const value = raw[column];
    row[column] = value === null || value === undefined ? null
      : typeof value === 'string' || typeof value === 'number' ? value
      : String(value);
  }
  return row as RbsPolicyRow;
}

export function assertTable(table: string): void {
  if (!TABLE_NAME.test(table)) {
    throw new Error(`Not a valid Trino table name (expected catalog.schema.table): "${table}"`);
  }
}
