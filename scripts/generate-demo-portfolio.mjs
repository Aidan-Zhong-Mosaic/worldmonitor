/**
 * Generates a synthetic demo portfolio in the exact shape of the real policy
 * extract, for the Exposure Lens proof of concept.
 *
 *   node scripts/generate-demo-portfolio.mjs
 *
 * Column headers are read from the real extract so the format cannot drift.
 * Every insured, obligor and reference is invented; countries and sectors are
 * real because the matching depends on them. Nothing here is client data.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = 'public/exposure-demo/portfolio.tsv';

// Column headers come from a real extract when one is present locally, so the
// demo format cannot drift from production. That extract is gitignored (it is
// client data), so on a checkout without it — CI, a server, a colleague's
// machine — fall back to the headers already baked into the generated file.
// Either way the header row is never hand-maintained.
const HEADER_SOURCES = [
  'data/exposure-poc/sample-policy-pv.tsv',
  OUT,
];
const headerFile = HEADER_SOURCES.find((f) => existsSync(f));
if (!headerFile) {
  console.error(`No header source found. Looked for:\n  ${HEADER_SOURCES.join('\n  ')}`);
  process.exit(1);
}
const HEADERS = readFileSync(headerFile, 'utf8').split('\n')[0].split('\t');
console.log(`Headers from ${headerFile} (${HEADERS.length} columns)`);

// Deterministic PRNG so the demo is identical every run.
let seed = 20260827;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const between = (lo, hi) => Math.round(lo + rnd() * (hi - lo));

const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n) => `${n.toFixed(2)}%`;
const ddmmyyyy = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const addDays = (iso, n) => {
  const dt = new Date(`${iso}T00:00:00Z`); dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};

// --- invented parties. Any resemblance to a real firm is unintended. ---
const INSUREDS = {
  trader: ['Kestrel Commodity Trading Pte Ltd', 'Northwind Resources SA', 'Marlin Energy Partners LLC', 'Solvent Bay Trading Ltd'],
  bank: ['Cardinal Union Bank NA', 'Harbourline Financial Group', 'Vantage Meridian Bank plc', 'Stonebridge Capital Markets'],
  prof: ['Calder & Vance LLP', 'Ashgrove Consulting Group', 'Pinnacroft Advisory Ltd', 'Rowntree Actuarial Services'],
  industrial: ['Verdanta Chemicals Ltd', 'Ironvale Manufacturing Inc', 'Cobalt Ridge Mining Corp', 'Thornfield Industries SA'],
  tech: ['Lumenpath Systems Inc', 'Arcadia Cloud Services Ltd', 'Quillstone Software Group', 'Northgate Data Networks'],
  retail: ['Bellweather Retail Group', 'Sundial Hospitality Holdings', 'Corvid Logistics BV', 'Fairmount Property Trust'],
};
const OBLIGORS = [
  { name: 'Meridian Power Authority', country: 'Chile', sector: 'Energy' },
  { name: 'Anseri National Petroleum', country: 'Nigeria', sector: 'Energy' },
  { name: 'Rio Verde Infrastructure SA', country: 'Brazil', sector: 'Construction' },
  { name: 'Halcyon Ports Authority', country: 'Indonesia', sector: 'Transport' },
  { name: 'Estrella Grid Corporation', country: 'Mexico', sector: 'Energy' },
  { name: 'Zambezi Minerals Board', country: 'Zambia', sector: 'Mining' },
];

const TERRITORIES = [
  'Worldwide', 'Worldwide with USA exclusions', 'Worldwide excluding USA',
  'Colombia', 'Nigeria', 'Mexico', 'Indonesia', 'Peru', 'Chile', 'United States', 'Brazil', 'Philippines',
];

const SECTORS = [
  ['K. FINANCIAL AND INSURANCE ACTIVITIES', 'Broker/Dealer', '523160', 'Commodity Contracts Intermediation'],
  ['D. ELECTRICITY, GAS, STEAM AND AIR CONDITIONING SUPPLY', 'Energy', '221118', 'Other Electric Power Generation'],
  ['B. MINING AND QUARRYING', 'Mining', '212290', 'Other Metal Ore Mining'],
  ['C. MANUFACTURING', 'Manufacturing', '325199', 'All Other Basic Organic Chemical Manufacturing'],
  ['J. INFORMATION AND COMMUNICATION', 'Technology', '541512', 'Computer Systems Design Services'],
  ['H. TRANSPORTATION AND STORAGE', 'Transport', '488310', 'Port and Harbor Operations'],
  ['G. WHOLESALE AND RETAIL TRADE', 'Retail', '445110', 'Supermarkets and Other Grocery Retailers'],
];

/** Each line of business, with the wording and insured pool it draws from. */
const LINES = [
  { lob: 'Political Violence',       wording: 'War and Terrorism',       codes: '2T, AO, AP', pool: ['industrial', 'retail', 'trader'], territorial: true,  n: 10 },
  { lob: 'Political Risk',           wording: 'Contract Frustration',    codes: 'CF',         pool: ['trader'],                          obligor: true,      n: 8 },
  { lob: 'Environmental Liability',  wording: 'Pollution Legal Liability', codes: 'EL',       pool: ['industrial'],                      territorial: true,  n: 6 },
  { lob: 'Cyber',                    wording: 'Cyber Liability',         codes: 'CY',         pool: ['tech', 'retail', 'bank'],          n: 7 },
  { lob: 'Financial Institutions',   wording: 'FI Professional Indemnity', codes: 'FI',       pool: ['bank'],                            n: 6 },
  { lob: 'Professional Liability',   wording: 'Professional Indemnity',  codes: 'PI',         pool: ['prof'],                            n: 6 },
  { lob: 'Transactional Liability',  wording: 'Warranty and Indemnity',  codes: 'TL',         pool: ['bank', 'prof'],                    n: 4 },
  { lob: 'Specialty Casualty',       wording: 'Excess Casualty',         codes: 'SC',         pool: ['industrial', 'retail'],            n: 5 },
];

const rows = [];
let seq = 1;

// The demo events sit between April and June 2026, so incept most cover before
// that and run it long enough to still be live. A synthetic book where nothing
// is in force proves nothing.
const INCEPT_MONTHS = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'];

for (const line of LINES) {
  // Round-robin rather than random pick, so every invented party appears at
  // least once and the seeded events reliably find their counterparty.
  const pool = line.pool.flatMap((k) => INSUREDS[k]);
  for (let i = 0; i < line.n; i++) {
    const inception = `${INCEPT_MONTHS[i % INCEPT_MONTHS.length]}-${String(between(1, 27)).padStart(2, '0')}`;
    const days = pick([273, 365, 365, 365, 456]);
    const expiry = addDays(inception, days - 1);

    const obligor = line.obligor ? OBLIGORS[i % OBLIGORS.length] : null;
    const sector = obligor
      ? (SECTORS.find((s) => s[1] === obligor.sector) ?? pick(SECTORS))
      : pick(SECTORS);

    const insured = pool[i % pool.length];
    const territory = obligor ? obligor.country : TERRITORIES[i % TERRITORIES.length];

    const limit = pick([25, 50, 100, 250, 500, 1000, 2000]) * 1_000_000;
    const share = pick([1.5, 2, 2.5, 3.75, 4.17, 5, 7.5, 10]);
    const ourExposure = Math.round(limit * share / 100);
    const premium = Math.round(limit * (0.0008 + rnd() * 0.004));

    const r = {};
    for (const h of HEADERS) r[h] = '';

    r['Insured Name'] = insured;
    r['Underwriter Name'] = pick(['Ashby, Rowan', 'Delgado, Marta', 'Okafor, Chidi', 'Lindqvist, Sara']);
    r['Producing Underwriter Name'] = r['Underwriter Name'];
    r['Inception Date'] = ddmmyyyy(inception);
    r['Inception Year'] = inception.slice(0, 4);
    r['Expiry Date'] = ddmmyyyy(expiry);
    r['Bound Date'] = ddmmyyyy(addDays(inception, -between(5, 30)));
    r['Producing Mosaic Entity'] = 'Mosaic UK';
    r['Class of Business'] = line.lob;
    r['Service Company'] = 'Mosaic UK';
    r['Agreement YOA'] = inception.slice(0, 4);
    r['Accumulates on Agreement'] = 'Yes';
    r['Carrier Reference'] = `DEMO${String(seq).padStart(5, '0')}AA`;
    r['Policy Reference'] = `DEMO${String(seq).padStart(5, '0')}`;
    r['Policy Line Reference'] = `DEMO${String(seq).padStart(5, '0')}AA`;
    r['Unique Market Reference'] = `BDEMO${String(seq).padStart(5, '0')}`;
    r['Master Broker'] = pick(['Aon', 'Marsh', 'Lockton', 'Willis Towers Watson (WTW)', 'Gallagher']);
    r['Broker Name'] = `${r['Master Broker']} Limited`;
    r['Broker Key'] = String(between(1000, 9999));
    r['Obligor'] = obligor ? obligor.name : '';
    r['Renewal Date'] = ddmmyyyy(addDays(expiry, 1));
    r['Policy Period Days'] = String(days);
    r['Tenor in Months'] = String(Math.round(days / 30));
    r['Method of Placement (MOP)'] = pick(['Direct', 'Line Slip (Non-Binding)', 'Open Market']);
    r['Mapped Method of Placement (MOP)'] = pick(['Open Market', 'Facility/DUA']);
    r['Territory'] = territory;
    r['Insured Domicile'] = pick(['United States', 'United Kingdom', 'Singapore', 'Switzerland', 'Netherlands']);
    r['Insured State'] = r['Insured Domicile'] === 'United States' ? pick(['New York', 'Texas', 'Illinois']) : '';
    r['Lloyds Industrial Sector Code'] = String(between(10000, 10020));
    r['Lloyds Industrial Sector Description'] = sector[0];
    r['Mosaic Occupation Code'] = `MOS${String(between(1, 40)).padStart(3, '0')}`;
    r['Mosaic Occupation Description'] = sector[1];
    r['NAICS Code'] = sector[2];
    r['NAICS Description'] = sector[3];
    r['Slip Lead'] = pick(['', 'Beazley Furlonge Ltd', 'Hiscox Syndicates Ltd']);
    r['Bureau Lead'] = pick(['Lloyds Ark Syndicate Management Limited', 'XL Catlin Insurance Company Ltd']);
    r['Written Line (%)'] = pct(share);
    r['Agency Line/Share (%)'] = pct(share);
    r['Mosaic 1609 line (%)'] = pct(share);
    r['Mosaic 1609 Order (%)'] = '100.00%';
    r['Limit Currency'] = 'USD';
    r['Limit (Original Currency)'] = String(limit);
    r['Limit (USD)'] = usd(limit);
    r['Type of Layer'] = pick(['Primary', 'Primary', 'Excess']);
    r['Excess (USD)'] = '$0.00';
    r['100% Gross or Estimated Written Premium (Original Currency)'] = String(premium);
    r['Premium Currency'] = 'USD';
    r['100% Gross or Estimated Written Premium (USD)'] = usd(premium);
    r['Class'] = line.wording;
    r['Premium Type'] = 'M&D & Estimate';
    r['Lloyds Risk Code'] = line.codes;
    r['Mosaic GELR (%)'] = pct(20 + rnd() * 20);
    r['Brokerage (%)'] = '20.00%';
    r['Original Commission (%)'] = '20.00%';
    r['Business Plan Loss Ratio (%)'] = pct(35 + rnd() * 25);
    r['Mosaic 1609 Exposure (Original Currency)'] = String(ourExposure);
    r['Mosaic 1609 Exposure (USD)'] = usd(ourExposure);
    r['Mosaic 1609 Share Gross Written Premium (USD)'] = usd(Math.round(premium * share / 100));
    r['Mosaic 1609 Expected claims (USD)'] = usd(Math.round(premium * share / 100 * 0.3));
    r['Policy Created By'] = 'Demo Generator';
    r['Date Written'] = ddmmyyyy(addDays(inception, -between(1, 20)));
    r['Peer Reviewer'] = pick(['Ashby, Rowan', 'Delgado, Marta']);
    r['Jurisdiction Country'] = pick(['United Kingdom', 'United States']);
    r['Cyber Clause Status'] = line.lob === 'Cyber' ? 'Affirmation' : pick(['Exclusion', 'Affirmation']);
    r['Policy Status'] = 'Currently in Bound status';
    r['Ops Mapped Status'] = 'Currently in Signed Status';
    r['XFI-Policy Line Status'] = 'Signed';
    r['Renewal Status'] = pick(['New', 'Renewed']);
    r['Limit Basis'] = pick(['In Aggregate', 'Each and Every Loss']);

    rows.push(HEADERS.map((h) => r[h]).join('\t'));
    seq++;
  }
}

writeFileSync(OUT, [HEADERS.join('\t'), ...rows].join('\n') + '\n', 'utf8');
console.log(`Wrote ${rows.length} synthetic policies (${HEADERS.length} columns) to ${OUT}`);
for (const l of LINES) console.log(`  ${String(l.n).padStart(3)}  ${l.lob}`);
