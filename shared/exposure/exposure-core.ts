/**
 * Exposure Lens — core pipeline (proof of concept).
 *
 * Turns a raw policy-extract row into a normalised record, joins it against a
 * world event using a matcher chosen by line of business, and produces the ONLY
 * payload that is ever allowed to reach a language model.
 *
 * The rule this file enforces:
 *
 *     The model extracts and explains. It never retrieves, and it never counts.
 *
 * Extending to a new line of business means adding one entry to MATCHERS and
 * declaring which `Class of Business` values it serves. Nothing else changes.
 */

// ---------------------------------------------------------------------------
// 1. Field manifest — the auditable answer to "what leaves the building?"
// ---------------------------------------------------------------------------

export type FieldTier =
  /** Used in-network to find candidates. Never sent to a model. */
  | 'match'
  /** Rolled into a cohort total. Only the total may be sent. */
  | 'aggregate'
  /** Sent as an opaque token; real value re-attached in the browser. */
  | 'tokenised'
  /** Non-identifying descriptive context; safe to send verbatim. */
  | 'context'
  /** Never read by this pipeline at all. */
  | 'never';

export interface FieldRule { column: string; tier: FieldTier; why: string }

/** Anything absent from this list is unreadable — a leak becomes a code review. */
export const FIELD_MANIFEST: readonly FieldRule[] = [
  // identity — matching keys, but commercially sensitive
  { column: 'Insured Name',                         tier: 'tokenised', why: 'Who is covered. A matching key for lines where an event names the insured, and commercially sensitive.' },
  { column: 'Obligor',                              tier: 'tokenised', why: 'Counterparty whose default is covered — the join key for credit-style lines.' },

  // classification — safe, non-identifying context
  { column: 'Class of Business',                    tier: 'context',   why: 'Selects which matcher runs. Political Violence, Political Risk, Cyber…' },
  { column: 'Class',                                tier: 'context',   why: 'The peril wording, e.g. War and Terrorism, Contract Frustration.' },
  { column: 'Lloyds Risk Code',                     tier: 'context',   why: 'Machine-readable peril codes. May be multi-valued.' },
  { column: 'Territory',                            tier: 'context',   why: 'Territorial scope of cover. Free text in this extract — parsed, see parseTerritory.' },
  { column: 'Insured Domicile',                     tier: 'context',   why: 'Where the insured sits.' },
  { column: 'Insured State',                        tier: 'context',   why: 'Sub-national domicile.' },
  { column: 'Jurisdiction Country',                 tier: 'context',   why: 'Governing law.' },
  { column: 'Lloyds Industrial Sector Description', tier: 'context',   why: 'Sector sensitivity.' },
  { column: 'Mosaic Occupation Description',        tier: 'context',   why: 'Coarser sector label.' },
  { column: 'Commodity',                            tier: 'context',   why: 'Commodity exposure where present.' },
  { column: 'Type of Layer',                        tier: 'context',   why: 'Primary vs excess changes how a loss attaches.' },
  { column: 'Limit Basis',                          tier: 'context',   why: 'In aggregate vs each and every loss.' },

  // period — stays in network; only the derived window bound is surfaced
  { column: 'Inception Date',                       tier: 'match',     why: 'Authoritative start of cover when present.' },
  { column: 'Expiry Date',                          tier: 'match',     why: 'Authoritative end of cover when present.' },
  { column: 'Renewal Date',                         tier: 'match',     why: 'Fallback period source. See deriveWindow — this is NOT inception.' },
  { column: 'Policy Period Days',                   tier: 'match',     why: 'Length of cover, inclusive of both endpoints.' },
  { column: 'Policy Status',                        tier: 'match',     why: 'Only bound/signed policies can be exposed.' },
  { column: 'XFI-Policy Line Status',               tier: 'match',     why: 'Second status source; both must agree.' },
  { column: 'NAICS Code',                           tier: 'match',     why: 'Precise sector join.' },

  // money — aggregated in-network, only totals travel
  { column: 'Limit (USD)',                          tier: 'aggregate', why: 'Cohort limit total. Per-policy figure never leaves.' },
  { column: 'Mosaic 1609 Exposure (USD)',           tier: 'aggregate', why: 'Our net exposure — cohort total only.' },
  { column: 'Excess (USD)',                         tier: 'aggregate', why: 'Attachment point; aggregated.' },
  { column: 'Deductible (USD)',                     tier: 'aggregate', why: 'Retention; aggregated.' },

  // refused outright
  { column: '100% Gross or Estimated Written Premium (USD)', tier: 'never', why: 'Pricing. Irrelevant to whether an event touches the policy.' },
  { column: 'Mosaic 1609 Share Gross Written Premium (USD)', tier: 'never', why: 'Our revenue on the risk.' },
  { column: 'Mosaic GELR (%)',                      tier: 'never',     why: 'Proprietary pricing view.' },
  { column: 'Business Plan Loss Ratio (%)',         tier: 'never',     why: 'Proprietary pricing view.' },
  { column: 'Mosaic 1609 Expected claims (USD)',    tier: 'never',     why: 'Our own loss pick. Circular if fed to a model that writes about claims.' },
  { column: 'Brokerage (%)',                        tier: 'never',     why: 'Commercial terms.' },
  { column: 'Original Commission (%)',              tier: 'never',     why: 'Commercial terms.' },
  { column: 'Achieved Price (%)',                   tier: 'never',     why: 'Commercial terms.' },
  { column: 'Broker Name',                          tier: 'never',     why: 'Trading relationship.' },
  { column: 'Master Broker',                        tier: 'never',     why: 'Trading relationship.' },
  { column: 'Slip Lead',                            tier: 'never',     why: 'Market relationship.' },
  { column: 'Bureau Lead',                          tier: 'never',     why: 'Market relationship.' },
  { column: 'Underwriter Name',                     tier: 'never',     why: 'Employee name — personal data.' },
  { column: 'Producing Underwriter Name',           tier: 'never',     why: 'Employee name — personal data.' },
  { column: 'Policy Created By',                    tier: 'never',     why: 'Employee name — personal data.' },
  { column: 'Peer Reviewer',                        tier: 'never',     why: 'Employee name — personal data.' },
];

const TIER_BY_COLUMN = new Map(FIELD_MANIFEST.map((r) => [r.column, r.tier]));
export function tierOf(column: string): FieldTier { return TIER_BY_COLUMN.get(column) ?? 'never'; }
export function readableColumns(): number { return FIELD_MANIFEST.filter((f) => f.tier !== 'never').length; }
export function refusedColumns(): number { return FIELD_MANIFEST.filter((f) => f.tier === 'never').length; }

// ---------------------------------------------------------------------------
// 2. Territorial scope — the free-text field that has to become structured
// ---------------------------------------------------------------------------

export interface TerritoryScope {
  raw: string;
  worldwide: boolean;
  included: string[];
  excluded: string[];
  /** Phrases we recognised but did not turn into rules. Never silently dropped. */
  caveats: string[];
  /** True when the string was not fully understood — routes to review, not auto-surface. */
  needsReview: boolean;
}

const COUNTRY_SYNONYMS: Record<string, string> = {
  usa: 'United States', us: 'United States', 'u s a': 'United States',
  'united states': 'United States', 'united states of america': 'United States',
  uk: 'United Kingdom', 'united kingdom': 'United Kingdom',
};

function canonCountry(token: string): string | null {
  const k = token.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  return COUNTRY_SYNONYMS[k] ?? null;
}

/**
 * Resolve the country at the END of a captured phrase.
 *
 * "with USA exclusions" captures "Worldwide with USA" before this: the country
 * is the trailing token, not the whole phrase. Walk suffixes shortest-last so
 * "United States" still beats "States".
 */
function resolveTrailingCountry(token: string): string | null {
  const words = token.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const hit = canonCountry(words.slice(i).join(' '));
    if (hit) return hit;
  }
  return null;
}

/**
 * Parse the free-text Territory column into a scope the matcher can use.
 *
 * Real values look like "Worldwide with USA exclusions but no USA exposure".
 * That is prose, not data — so this parser handles the shapes we have seen and
 * flags anything else for review rather than guessing. In production this is
 * the natural place for the extraction model: same strict-schema contract,
 * reviewed once per distinct wording and then cached.
 */
export function parseTerritory(raw: string | null): TerritoryScope {
  const text = (raw ?? '').trim();
  const scope: TerritoryScope = {
    raw: text, worldwide: false, included: [], excluded: [], caveats: [], needsReview: false,
  };
  if (!text) { scope.needsReview = true; scope.caveats.push('Territory is blank'); return scope; }

  const lower = text.toLowerCase();
  scope.worldwide = /\bworldwide\b|\bglobal\b/.test(lower);

  // "with USA exclusions", "excluding USA", "ex USA", "USA excluded"
  const exclusionRe = /(?:excluding|excl\.?|ex\b|without)\s+([A-Za-z .]+?)(?=\s+(?:but|and|with|,)|$)|([A-Za-z .]+?)\s+(?:exclusions?|excluded)/gi;
  let m: RegExpExecArray | null;
  while ((m = exclusionRe.exec(text)) !== null) {
    const token = (m[1] ?? m[2] ?? '').trim();
    const country = resolveTrailingCountry(token);
    if (country) { if (!scope.excluded.includes(country)) scope.excluded.push(country); }
    else if (token) scope.caveats.push(`Unrecognised exclusion: "${token}"`);
  }

  // Underwriting statements of fact, e.g. "no USA exposure" — record, don't act on.
  const noExposure = /no\s+([A-Za-z .]+?)\s+exposure/gi;
  while ((m = noExposure.exec(text)) !== null) {
    const country = resolveTrailingCountry((m[1] ?? '').trim());
    if (country) scope.caveats.push(`Stated no ${country} exposure (underwriting statement, not a contractual exclusion)`);
  }

  if (!scope.worldwide && scope.included.length === 0) {
    const country = resolveTrailingCountry(text);
    if (country) scope.included.push(country);
    else { scope.needsReview = true; scope.caveats.push(`Could not resolve territory to countries: "${text}"`); }
  }
  if (scope.caveats.some((c) => c.startsWith('Unrecognised'))) scope.needsReview = true;
  return scope;
}

/** Does this policy's territorial scope cover the given country? */
export function scopeCovers(scope: TerritoryScope, country: string): boolean {
  if (scope.excluded.some((c) => c.toLowerCase() === country.toLowerCase())) return false;
  if (scope.worldwide) return true;
  return scope.included.some((c) => c.toLowerCase() === country.toLowerCase());
}

// ---------------------------------------------------------------------------
// 3. Normalisation
// ---------------------------------------------------------------------------

export interface NormalizedPolicy {
  ref: string;
  lob: string;
  className: string;
  riskCodes: string[];
  status: 'in-force' | 'not-bound';
  insuredName: string | null;
  obligor: string | null;
  territory: TerritoryScope;
  insuredDomicile: string | null;
  insuredState: string | null;
  jurisdiction: string | null;
  sector: string | null;
  occupation: string | null;
  commodity: string | null;
  inception: string | null;
  expiry: string | null;
  periodDays: number | null;
  limitUsd: number | null;
  netExposureUsd: number | null;
  layerType: string | null;
  limitBasis: string | null;
  /** Parsing decisions the data owner must confirm. Surfaced, never swallowed. */
  assumptions: string[];
}

function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const c = raw.replace(/[$£€,%\s"]/g, '');
  if (!c) return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}
function str(raw: string | undefined): string | null {
  const v = (raw ?? '').replace(/^"+|"+$/g, '').trim();
  return v ? v : null;
}

/**
 * Dates in this extract are DD/MM/YYYY. Proven by the Political Violence row:
 * inception 29/04/2021 (29 cannot be a month) with expiry 01/10/2021 and a
 * stated 156-day period — 155 days apart, i.e. inclusive of both endpoints.
 */
export function parseDate(raw: string | undefined): string | null {
  const v = (raw ?? '').trim().split(' ')[0];
  if (!v) return null;
  const p = v.split('/');
  if (p.length !== 3) return null;
  const day = Number(p[0]); const month = Number(p[1]); const year = Number(p[2]);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Establish the in-force window.
 *
 * Prefer the explicit Inception/Expiry columns. Where an extract omits them,
 * fall back to Renewal Date — but note what the Political Violence row proves:
 * expiry 01/10/2021 with Renewal Date 02/10/2021 means Renewal Date is the day
 * cover NEXT incepts, i.e. expiry + 1. It is not the inception of this policy.
 */
export function deriveWindow(row: Record<string, string>, assumptions: string[]): {
  inception: string | null; expiry: string | null;
} {
  const explicitInception = parseDate(row['Inception Date']);
  const explicitExpiry = parseDate(row['Expiry Date']);
  if (explicitInception && explicitExpiry) return { inception: explicitInception, expiry: explicitExpiry };

  const renewal = parseDate(row['Renewal Date']);
  const days = num(row['Policy Period Days']);
  if (!renewal || days === null) {
    assumptions.push('No usable policy period: this extract has neither Inception/Expiry Date nor a parseable Renewal Date + Policy Period Days.');
    return { inception: null, expiry: null };
  }
  const expiry = addDays(renewal, -1);
  const inception = addDays(expiry, -(days - 1));
  assumptions.push(
    `This extract has no Inception/Expiry Date columns. Window derived from Renewal Date (${row['Renewal Date']}) treated as expiry + 1 day — the reading the Political Violence extract supports — giving ${inception} → ${expiry}. REQUEST THE EXTRACT WITH EXPLICIT Inception Date AND Expiry Date COLUMNS; do not run production matching on a derived window.`,
  );
  return { inception, expiry };
}

export function normalizePolicy(row: Record<string, string>, ref: string): NormalizedPolicy {
  const assumptions: string[] = [];
  const { inception, expiry } = deriveWindow(row, assumptions);

  const territory = parseTerritory(str(row['Territory']));
  if (territory.needsReview) {
    assumptions.push(`Territory "${territory.raw}" was not fully understood — routed to review rather than auto-surfaced.`);
  }

  const bound = /bound|signed/i.test(row['Policy Status'] ?? '')
    && /signed|bound/i.test(row['XFI-Policy Line Status'] ?? '');

  const riskCodes = (str(row['Lloyds Risk Code']) ?? '')
    .split(',').map((c) => c.trim()).filter(Boolean);

  return {
    ref,
    lob: str(row['Class of Business']) ?? inferLob(str(row['Class'])),
    className: str(row['Class']) ?? 'Unknown',
    riskCodes,
    status: bound ? 'in-force' : 'not-bound',
    insuredName: str(row['Insured Name']),
    obligor: str(row['Obligor']),
    territory,
    insuredDomicile: str(row['Insured Domicile']),
    insuredState: str(row['Insured State']),
    jurisdiction: str(row['Jurisdiction Country']),
    sector: str(row['Lloyds Industrial Sector Description']),
    occupation: str(row['Mosaic Occupation Description']),
    commodity: str(row['Commodity']),
    inception, expiry,
    periodDays: num(row['Policy Period Days']),
    limitUsd: num(row['Limit (USD)']),
    netExposureUsd: num(row['Mosaic 1609 Exposure (USD)']),
    layerType: str(row['Type of Layer']),
    limitBasis: str(row['Limit Basis']),
    assumptions,
  };
}

/** Older extracts omit "Class of Business"; fall back to the peril wording. */
function inferLob(className: string | null): string {
  if (!className) return 'Unknown';
  if (/contract frustration|non.?payment|political risk/i.test(className)) return 'Political Risk';
  if (/war|terror|political violence|riot|strike/i.test(className)) return 'Political Violence';
  return className;
}

/** Parse a tab-separated extract. Pure string work so the browser and the
 *  server share one parser and cannot disagree about the shape. */
export function parsePortfolioTsv(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  const headers = (lines[0] ?? '').split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

// ---------------------------------------------------------------------------
// 4. Entity resolution — the learned alias table
// ---------------------------------------------------------------------------

export interface EntityAlias {
  policyName: string; aliases: string[]; parent?: string; riskCountry?: string; confirmedBy?: string;
}

export const ENTITY_ALIASES: EntityAlias[] = [
  {
    policyName: 'CFE International LLC',
    aliases: ['CFE International', 'CFEi', 'Comision Federal de Electricidad', 'Comisión Federal de Electricidad', 'CFE'],
    parent: 'Comisión Federal de Electricidad', riskCountry: 'Mexico', confirmedBy: 'demo seed',
  },
  {
    policyName: 'Willis Towers Watson Northeast, Inc',
    aliases: ['Willis Towers Watson', 'WTW', 'Willis Limited', 'Willis Towers Watson Northeast'],
    parent: 'WTW plc', confirmedBy: 'demo seed',
  },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface EntityHit { matchedOn: string; via: 'policy name' | 'alias' | 'parent'; riskCountry: string | null }

export function resolveEntity(name: string | null, eventEntities: string[]): EntityHit | null {
  if (!name) return null;
  const record = ENTITY_ALIASES.find((e) => norm(e.policyName) === norm(name));
  const candidates: Array<{ name: string; via: EntityHit['via'] }> = [{ name, via: 'policy name' }];
  if (record) {
    for (const a of record.aliases) candidates.push({ name: a, via: 'alias' });
    if (record.parent) candidates.push({ name: record.parent, via: 'parent' });
  }
  for (const entity of eventEntities) {
    const n = norm(entity);
    for (const c of candidates) {
      const cn = norm(c.name);
      if (n === cn || n.includes(cn) || cn.includes(n)) {
        return { matchedOn: entity, via: c.via, riskCountry: record?.riskCountry ?? null };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 5. Matchers — one per exposure key, selected by line of business
// ---------------------------------------------------------------------------

export interface WorldEvent {
  id: string; headline: string; peril: string;
  triggersClasses: string[];
  countries: string[]; entities: string[]; sectors: string[];
  occurredAt: string; sourceUrl: string; sourcePanel: string;
}

export interface MatchReason { test: string; passed: boolean; detail: string }

export interface PolicyMatch {
  policy: NormalizedPolicy;
  matcher: string;
  matched: boolean;
  reasons: MatchReason[];
  /** What this matcher could NOT test, because the extract lacks the data. */
  limitations: string[];
}

export interface ExposureMatcher {
  id: string;
  label: string;
  /** `Class of Business` values this matcher serves. */
  appliesTo: string[];
  /** Columns it needs. Missing ones become limitations, not silent passes. */
  requires: string[];
  match(policy: NormalizedPolicy, event: WorldEvent): PolicyMatch;
}

/** Tests every line shares: live cover for a peril that can trigger the wording. */
function baseGate(policy: NormalizedPolicy, event: WorldEvent): MatchReason[] {
  const statusOk = policy.status === 'in-force';
  const inWindow = Boolean(policy.inception && policy.expiry
    && event.occurredAt >= policy.inception && event.occurredAt <= policy.expiry);
  const classOk = event.triggersClasses.some((c) => norm(c) === norm(policy.className));
  return [
    { test: 'Policy bound', passed: statusOk, detail: statusOk ? 'Bound and signed' : `Status is ${policy.status}` },
    {
      test: 'In force at event date', passed: inWindow,
      detail: policy.inception && policy.expiry
        ? `Event ${event.occurredAt} vs cover ${policy.inception} → ${policy.expiry}`
        : 'No usable policy period',
    },
    {
      test: 'Peril can trigger this wording', passed: classOk,
      detail: classOk ? `${event.peril} is a "${policy.className}" trigger` : `${event.peril} does not trigger "${policy.className}"`,
    },
  ];
}

/** Political Violence, War & Terrorism: exposure follows the territorial scope. */
export const territorialScopeMatcher: ExposureMatcher = {
  id: 'territorial-scope',
  label: 'Territorial scope',
  appliesTo: ['Political Violence', 'Environmental Liability'],
  requires: ['Territory', 'Inception Date', 'Expiry Date'],
  match(policy, event) {
    const reasons = baseGate(policy, event);
    const covered = event.countries.filter((c) => scopeCovers(policy.territory, c));
    const excludedHits = event.countries.filter((c) =>
      policy.territory.excluded.some((x) => x.toLowerCase() === c.toLowerCase()));

    reasons.push({
      test: 'Country within territorial scope',
      passed: covered.length > 0,
      detail: covered.length > 0
        ? `${covered.join(', ')} covered by "${policy.territory.raw}"`
        : excludedHits.length > 0
          ? `${excludedHits.join(', ')} is contractually EXCLUDED by "${policy.territory.raw}"`
          : `No event country falls inside "${policy.territory.raw}"`,
    });

    const insuredHit = resolveEntity(policy.insuredName, event.entities);
    reasons.push({
      test: 'Insured named in event',
      passed: Boolean(insuredHit),
      detail: insuredHit ? `"${insuredHit.matchedOn}" → insured via ${insuredHit.via}` : 'Insured not named (not required for this line)',
    });

    const gate = reasons.slice(0, 3).every((r) => r.passed);
    const matched = gate && covered.length > 0;

    // Political Violence exposure really sits at the insured's physical
    // locations. This extract carries no schedule of values, so scope is the
    // finest join available — say so rather than implying a site-level result.
    const limitations = [
      'No location schedule in this extract — matched on territorial scope, not on the insured\'s actual sites. A statement of values would allow a radius match against the event coordinates.',
    ];
    if (policy.territory.needsReview) {
      limitations.push(`Territory text "${policy.territory.raw}" was not fully parsed.`);
    }
    for (const c of policy.territory.caveats) limitations.push(c);

    return { policy, matcher: this.id, matched, reasons, limitations };
  },
};

/** Political Risk, Contract Frustration: exposure follows the obligor. */
export const obligorEntityMatcher: ExposureMatcher = {
  id: 'obligor-entity',
  label: 'Obligor entity',
  appliesTo: ['Political Risk'],
  requires: ['Obligor', 'Territory', 'Inception Date', 'Expiry Date'],
  match(policy, event) {
    const reasons = baseGate(policy, event);

    const entityHit = resolveEntity(policy.obligor, event.entities);
    reasons.push({
      test: 'Obligor named or resolved',
      passed: Boolean(entityHit),
      detail: entityHit ? `"${entityHit.matchedOn}" → obligor via ${entityHit.via}` : 'No entity in the event resolves to the obligor',
    });

    const territoryHit = event.countries.some((c) => scopeCovers(policy.territory, c));
    const riskCountryHit = Boolean(entityHit?.riskCountry
      && event.countries.some((c) => norm(c) === norm(entityHit.riskCountry as string)));
    reasons.push({
      test: 'Country of risk',
      passed: territoryHit || riskCountryHit,
      detail: territoryHit
        ? `Event country inside "${policy.territory.raw}"`
        : riskCountryHit
          ? `Event country matches the obligor's controlling state (${entityHit?.riskCountry}), not the policy Territory ("${policy.territory.raw}")`
          : 'No country overlap',
    });

    const sectorHit = event.sectors.some((s) =>
      (policy.sector && norm(policy.sector).includes(norm(s)))
      || (policy.occupation && norm(policy.occupation) === norm(s)));
    reasons.push({
      test: 'Sector overlap', passed: sectorHit,
      detail: sectorHit ? `Event sector overlaps ${policy.occupation ?? policy.sector}` : 'No sector overlap',
    });

    const gate = reasons.slice(0, 3).every((r) => r.passed);
    const nexus = Boolean(entityHit) || ((territoryHit || riskCountryHit) && sectorHit);
    return { policy, matcher: this.id, matched: gate && nexus, reasons, limitations: [] };
  },
};

/**
 * Financial and liability lines: exposure follows the named insured.
 *
 * These policies respond when the insured itself is caught up in the event —
 * a regulator names the bank, a breach hits the software firm, a claim lands on
 * the advisory practice. Geography is corroborating, not decisive, so a country
 * hit alone never makes a match here.
 */
export const namedInsuredMatcher: ExposureMatcher = {
  id: 'named-insured',
  label: 'Named insured',
  appliesTo: [
    'Cyber', 'Financial Institutions', 'Professional Liability',
    'Transactional Liability', 'Specialty Casualty',
  ],
  requires: ['Insured Name', 'Inception Date', 'Expiry Date'],
  match(policy, event) {
    const reasons = baseGate(policy, event);

    const insuredHit = resolveEntity(policy.insuredName, event.entities);
    reasons.push({
      test: 'Insured named or resolved',
      passed: Boolean(insuredHit),
      detail: insuredHit
        ? `"${insuredHit.matchedOn}" → insured via ${insuredHit.via}`
        : 'No entity in the event resolves to the insured',
    });

    const sectorHit = event.sectors.some((s) =>
      (policy.sector && norm(policy.sector).includes(norm(s)))
      || (policy.occupation && norm(policy.occupation) === norm(s)));
    reasons.push({
      test: 'Sector corroborates', passed: sectorHit,
      detail: sectorHit
        ? `Event sector overlaps ${policy.occupation ?? policy.sector}`
        : 'Event sector does not overlap (corroborating only)',
    });

    const gate = reasons.slice(0, 3).every((r) => r.passed);
    const limitations: string[] = [];
    if (norm(policy.lob) === norm('Cyber')) {
      limitations.push('No technology-dependency data in the extract — a vendor compromise can only match when the insured itself is named, not when it merely runs the affected software.');
    }
    if (norm(policy.lob) === norm('Transactional Liability')) {
      limitations.push('No deal or target-entity reference in the extract — matched on the insured only, so an event affecting the underlying target will be missed.');
    }

    // Named-insured lines require the entity. Sector alone is never enough.
    return { policy, matcher: this.id, matched: gate && Boolean(insuredHit), reasons, limitations };
  },
};

export const MATCHERS: readonly ExposureMatcher[] = [
  territorialScopeMatcher, obligorEntityMatcher, namedInsuredMatcher,
];

export function matcherFor(policy: NormalizedPolicy): ExposureMatcher | null {
  return MATCHERS.find((m) => m.appliesTo.some((c) => norm(c) === norm(policy.lob))) ?? null;
}

export function matchPolicy(policy: NormalizedPolicy, event: WorldEvent): PolicyMatch {
  const matcher = matcherFor(policy);
  if (!matcher) {
    return {
      policy, matcher: 'none', matched: false, reasons: [],
      limitations: [`No matcher registered for line of business "${policy.lob}". Add one to MATCHERS.`],
    };
  }
  return matcher.match(policy, event);
}

// ---------------------------------------------------------------------------
// 6. The choke point — the only thing a model ever sees
// ---------------------------------------------------------------------------

export interface ModelPayload {
  event: { headline: string; peril: string; countries: string[]; occurredAt: string };
  cohort: {
    policyCount: number; lines: string[]; wordings: string[];
    territories: string[]; sectors: string[]; insuredTokens: string[];
    netExposureUsd: number; aggregateLimitUsd: number; earliestExpiry: string | null;
    caveats: string[];
  };
}

export interface RedactedRequest {
  payload: ModelPayload;
  tokenMap: Record<string, string>;
  allowedNumbers: number[];
}

export function buildModelPayload(matches: PolicyMatch[], event: WorldEvent): RedactedRequest {
  const hit = matches.filter((m) => m.matched);
  const tokenMap: Record<string, string> = {};
  const insuredTokens: string[] = [];

  hit.forEach((m, i) => {
    const name = m.policy.insuredName ?? m.policy.obligor;
    if (!name) return;
    const token = `INSURED_${i + 1}`;
    tokenMap[token] = name;
    insuredTokens.push(token);
  });

  const netExposureUsd = hit.reduce((s, m) => s + (m.policy.netExposureUsd ?? 0), 0);
  const aggregateLimitUsd = hit.reduce((s, m) => s + (m.policy.limitUsd ?? 0), 0);
  const expiries = hit.map((m) => m.policy.expiry).filter((e): e is string => Boolean(e)).sort();
  const uniq = (xs: (string | null)[]): string[] => [...new Set(xs.filter((x): x is string => Boolean(x)))];

  return {
    payload: {
      event: {
        headline: event.headline, peril: event.peril,
        countries: event.countries, occurredAt: event.occurredAt,
      },
      cohort: {
        policyCount: hit.length,
        lines: uniq(hit.map((m) => m.policy.lob)),
        wordings: uniq(hit.map((m) => m.policy.className)),
        territories: uniq(hit.map((m) => m.policy.territory.raw)),
        sectors: uniq(hit.map((m) => m.policy.occupation)),
        insuredTokens,
        netExposureUsd, aggregateLimitUsd,
        earliestExpiry: expiries[0] ?? null,
        caveats: [...new Set(hit.flatMap((m) => m.limitations))],
      },
    },
    tokenMap,
    allowedNumbers: [hit.length, netExposureUsd, aggregateLimitUsd],
  };
}

/** Reject a model response that states a number it was not given. */
export function checkNumericProvenance(response: string, allowed: number[]): { ok: boolean; offenders: string[] } {
  const allowedSet = new Set(allowed.map((n) => Math.round(n)));
  const offenders: string[] = [];
  for (const raw of response.match(/\$?\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const n = Number(raw.replace(/[$,]/g, ''));
    if (!Number.isFinite(n) || n < 1000) continue;
    if (n >= 1900 && n <= 2100) continue;
    if (!allowedSet.has(Math.round(n))) offenders.push(raw);
  }
  return { ok: offenders.length === 0, offenders };
}
