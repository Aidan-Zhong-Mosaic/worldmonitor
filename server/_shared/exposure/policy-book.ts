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

import type { RbsMcpClient } from './rbs-mcp-client';

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
 * return type, so the rest of Exposure Lens can be built and tested without it.
 *
 * Not wired yet. To finish it, confirm with the MCP server's owners:
 *   1. the Trino name of the table (catalog.schema.table), for EXPOSURE_RBS_TABLE
 *   2. what a trino_execute_sql result looks like (JSON rows, or a text table?)
 *   3. whether the 100-row cap can be raised for a daily bulk read
 *
 * The plan once those are known: run buildRunDateSql, then pages 0, 1, 2 … of
 * buildPolicyBookPageSql through trino_execute_sql until a page returns fewer
 * than PAGE_SIZE rows. With a one-year lookback that is about 127 calls a day.
 */
export async function readPolicyBook(
  _client: RbsMcpClient,
  _options: { table: string; expiredOnOrAfter: string },
): Promise<PolicyBook> {
  throw new Error('readPolicyBook is not wired yet — see the note above it in server/_shared/exposure/policy-book.ts');
}

function assertTable(table: string): void {
  if (!TABLE_NAME.test(table)) {
    throw new Error(`Not a valid Trino table name (expected catalog.schema.table): "${table}"`);
  }
}
