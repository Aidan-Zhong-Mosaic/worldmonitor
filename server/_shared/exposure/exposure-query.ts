/**
 * Exposure query — turns one world event into the SQL that finds the policy
 * lines it may touch.
 *
 * The rule base lives here. Each rule is either a WHERE clause, so the lines
 * that do not match never leave Trino, or a note on the trace, so the panel can
 * say what was tested and what was not. The book is never read into memory to
 * be filtered afterwards.
 *
 * Rules, version 1:
 *
 *   1  grain      one row is a policy line per carrier, never a policy. See the
 *                 note on POLICY_LINE_KEY below — `policyno` is not unique.
 *   2  status     cancelled lines are excluded. `latest_line_status` is carried
 *                 through and shown, never filtered: signed, bound, written and
 *                 firm order noted all stay in, and the panel says so.
 *   3  in force   inception_date <= as-of <= expiry_date.
 *   4  cover      class_of_business narrows to the line of business chosen in
 *                 the header. lloyds_risk_code is wired but unused until the
 *                 event classifier exists; the four internal hierarchy columns
 *                 are awaiting confirmation from the table's designer.
 *   5  location   territory is authoritative; insured_location is a weaker
 *                 second limb. This is the rule that actually selects rows.
 *   6  party      insured and obligor are selected and displayed. They never
 *                 make a match on their own — a name hit raises confidence
 *                 downstream, where fuzzy comparison belongs.
 *   7  layer      type_of_layer and limitbasis are ranking signals for how hard
 *                 a loss would land on us. Shown, not filtered.
 *   8  money      mosaic1609_exposure_cnv_usd and sharelimit_cnv_usd are both
 *                 selected and both displayed, and both are summed by countSql.
 *
 * Every value interpolated into SQL comes from a closed vocabulary — a key of
 * TERRITORY_SCOPES, a validated ISO date, an integer — and is escaped as well.
 * Nothing that originated in a news headline reaches the query text.
 *
 * Deliberately does not import shared/exposure/exposure-core: the request below
 * takes an id and a list of country codes rather than a WorldEvent, so the
 * whole client-side pipeline stays out of the server bundle.
 *
 * SERVER-SIDE ONLY, like policy-book.ts and rbs-mcp-client.ts.
 */

import {
  TERRITORY_SCOPES,
  countryName,
  scopeCovers,
} from '../../../shared/exposure/territory-scopes';
import { POLICY_BOOK_COLUMNS, assertTable } from './policy-book';

export const POLICY_LINE_KEY = [
  'policylinekey',
  'servicecompany',
  'exp_policy_flag',
  'policyactivitykey',
] as const;

export const CANCELLED_POLICY_STATUSES = ['Cancelled Mid Term'] as const;

export const DEFAULT_ROW_LIMIT = 500;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_COUNTRY = /^[A-Z]{2}$/;
const PLAIN_VALUE = /^[^\r\n\t\0]{1,120}$/;

export interface ExposureQueryRequest {
  table: string;
  eventId: string;
  countries: readonly string[];
  asOf: string;
  runDate?: string | null;
  classesOfBusiness?: readonly string[];
  riskCodes?: readonly string[];
  rowLimit?: number;
}

export interface TerritoryResolution {
  covering: string[];
  unresolved: string[];
  excluded: string[];
}

export interface ExposureQueryTrace {
  eventId: string;
  asOf: string;
  runDate: string | null;
  countries: string[];
  territory: TerritoryResolution;
  insuredLocations: string[];
  classesOfBusiness: string[];
  riskCodes: string[];
  notes: string[];
  limitations: string[];
}

export type ExposureQueryResult =
  | { matchable: true; sql: string; countSql: string; trace: ExposureQueryTrace }
  | { matchable: false; reason: string; trace: ExposureQueryTrace };

export function resolveTerritoryValues(countries: readonly string[]): TerritoryResolution {
  const covering: string[] = [];
  const unresolved: string[] = [];
  const excluded: string[] = [];

  for (const [wording, scope] of Object.entries(TERRITORY_SCOPES)) {
    if (scope.needsReview) {
      unresolved.push(wording);
      continue;
    }
    if (countries.some((code) => scopeCovers(scope, code))) {
      covering.push(wording);
      continue;
    }
    if (scope.worldwide) excluded.push(wording);
  }
  return { covering, unresolved, excluded };
}

export function buildExposureQuery(request: ExposureQueryRequest): ExposureQueryResult {
  const {
    table, eventId, asOf, runDate = null,
    classesOfBusiness = [], riskCodes = [], rowLimit = DEFAULT_ROW_LIMIT,
  } = request;

  assertTable(table);
  if (!ISO_DATE.test(asOf)) throw new Error(`asOf must be YYYY-MM-DD, got "${asOf}"`);
  if (runDate !== null && !ISO_DATE.test(runDate)) {
    throw new Error(`runDate must be YYYY-MM-DD or null, got "${runDate}"`);
  }
  if (!Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 10_000) {
    throw new Error(`rowLimit must be a whole number between 1 and 10000, got ${rowLimit}`);
  }
  const countries = [...new Set(request.countries)].sort();
  for (const code of countries) {
    if (!ISO_COUNTRY.test(code)) {
      throw new Error(`Country must be an uppercase ISO 3166-1 alpha-2 code, got "${code}"`);
    }
  }
  for (const value of [...classesOfBusiness, ...riskCodes]) {
    if (!PLAIN_VALUE.test(value)) throw new Error(`Not a usable filter value: "${value}"`);
  }

  const territory = resolveTerritoryValues(countries);
  const insuredLocations = countries.map(countryName).filter((name) => PLAIN_VALUE.test(name));

  const trace: ExposureQueryTrace = {
    eventId, asOf, runDate,
    countries,
    territory,
    insuredLocations,
    classesOfBusiness: [...classesOfBusiness],
    riskCodes: [...riskCodes],
    notes: [],
    limitations: [],
  };

  // ---- Rule 5: the limb that selects ---------------------------------------
  // Built first, because with nothing to match on there is no query worth
  // sending: an event with no countries would otherwise return the whole book.
  const locationLimbs: string[] = [];
  if (territory.covering.length > 0) {
    locationLimbs.push(`territory IN (${sqlList(territory.covering)})`);
  }
  if (territory.unresolved.length > 0) {
    locationLimbs.push(`territory IN (${sqlList(territory.unresolved)})`);
  }
  if (insuredLocations.length > 0) {
    locationLimbs.push(`insured_location IN (${sqlList(insuredLocations)})`);
  }
  if (locationLimbs.length === 0) {
    trace.limitations.push('No location to match on, so no policy lines were tested.');
    return { matchable: false, reason: `No territory wording covers ${countries.join(', ')}.`, trace };
  }

  const asOfTs = `TIMESTAMP '${asOf} 00:00:00'`;
  const where: string[] = [];

  // The reporting set. Confirmed with the table's owner: report_data = 'Yes'.
  where.push(`report_data = 'Yes'`);

  // One snapshot only. The table holds several run_dates, and without this the
  // same policy line comes back once per snapshot and exposure is multiplied.
  // CAST so this works whether run_date is a date or a timestamp.
  where.push(runDate
    ? `CAST(run_date AS DATE) = DATE '${runDate}'`
    : `run_date = (SELECT MAX(run_date) FROM ${table} WHERE report_data = 'Yes')`);

  // Rule 2. The IS NULL limb matters: in SQL, NULL NOT IN ('x') is NULL, not
  // true, so without it a line with no status would be filtered out silently.
  where.push(
    `(policystatus IS NULL OR policystatus NOT IN (${sqlList(CANCELLED_POLICY_STATUSES)}))`,
  );

  // Rule 3. Both dates fail open for the same reason: a missing date means we do
  // not know whether cover was live, and unknown cover must be reviewed by a
  // person, not hidden by a query.
  where.push(`(inception_date IS NULL OR inception_date <= ${asOfTs})`);
  where.push(`(expiry_date IS NULL OR expiry_date >= ${asOfTs})`);

  // Rule 4. Empty means "no constraint", never "match nothing" — an empty list
  // would compile to IN (), which is a syntax error in Trino.
  if (classesOfBusiness.length > 0) {
    where.push(`class_of_business IN (${sqlList(classesOfBusiness)})`);
  }
  if (riskCodes.length > 0) {
    where.push(`lloyds_risk_code IN (${sqlList(riskCodes)})`);
  }

  where.push(`(${locationLimbs.join('\n       OR ')})`);

  // ---- what the card will say ----------------------------------------------
  const named = countries.map(countryName).join(', ') || 'no country';
  trace.notes.push(
    `${territory.covering.length} territory wordings cover ${named}.`,
  );
  if (territory.excluded.length > 0) {
    trace.notes.push(
      `${territory.excluded.length} worldwide wordings exclude ${named} and were left out.`,
    );
  }
  if (territory.unresolved.length > 0) {
    trace.notes.push(
      `${territory.unresolved.length} territory wordings could not be resolved and are included for review.`,
    );
  }
  trace.notes.push(
    'Line status is not filtered: signed, bound, written and firm order noted are all included.',
  );
  trace.notes.push(
    runDate ? `Book snapshot pinned to ${runDate}.` : 'Book snapshot is the latest run_date.',
  );
  trace.limitations.push(
    'Peril is not tested: no risk-code classification of events in this version.',
  );
  trace.limitations.push(
    'The four internal classification columns are not used yet, pending confirmation of their meaning.',
  );
  trace.limitations.push(
    'Insured and obligor are displayed but not matched; a name hit only raises confidence downstream.',
  );
  if (insuredLocations.length > 0) {
    trace.limitations.push(
      'insured_location is matched on English country names — verify that against the column’s own vocabulary.',
    );
  }

  const whereSql = where.join('\n  AND ');
  const selectList = POLICY_BOOK_COLUMNS.map((c) => c.column).join(', ');

  const sql = [
    `SELECT ${selectList}`,
    `FROM ${table}`,
    `WHERE ${whereSql}`,
    `ORDER BY mosaic1609_exposure_cnv_usd DESC NULLS LAST, ${POLICY_LINE_KEY.join(', ')}`,
    `LIMIT ${rowLimit}`,
  ].join('\n');

  const countSql = [
    'SELECT COUNT(*) AS lines,',
    '       SUM(mosaic1609_exposure_cnv_usd) AS net_exposure_usd,',
    '       SUM(sharelimit_cnv_usd) AS share_limit_usd',
    `FROM ${table}`,
    `WHERE ${whereSql}`,
  ].join('\n');

  return { matchable: true, sql, countSql, trace };
}

/**
 * A single-quoted Trino string literal. Callers pass values from closed
 * vocabularies, so this is the second line of defence rather than the first:
 * doubling the quote keeps a wording containing an apostrophe from ending the
 * literal early.
 */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlList(values: readonly string[]): string {
  return values.map(sqlString).join(', ');
}
