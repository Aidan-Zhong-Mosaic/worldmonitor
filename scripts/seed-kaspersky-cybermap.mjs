#!/usr/bin/env node
// @ts-check
//
// Kaspersky Cyberthreat Real-Time Map — country attack-rate statistics.
//
// Source: the JSON files behind https://cybermap.kaspersky.com/stats, served
// from Kaspersky's media bucket. Undocumented and keyless, and sent without
// CORS headers, so the browser cannot read them — this seeder is the only
// reader. Values are Kaspersky Security Network (KSN) telemetry: the share of
// KSN users in a country who hit a detection that week, per detection
// subsystem. They describe Kaspersky's install base, not a census — countries
// where KSN coverage is thin (e.g. the US after the 2024 BIS sales ban) read low.
//
// The animated arcs on the live map come from a separate hourly feed
// (/data/events/<feed>/<hour>.json, base64 Uint32 blobs) that carries no IOC,
// actor or target detail. It is deliberately not ingested: it is a
// visualisation loop, not intelligence.

import { loadEnvFile, runSeed, loadSharedConfig } from './_seed-utils.mjs';

loadEnvFile(import.meta.url);

export const KASPERSKY_CYBERMAP_KEY = 'cyber:kaspersky-stats:v1';
const CACHE_TTL = 3 * 24 * 3600; // 3 days — upstream rolls daily; survives two missed 3-hourly crons with margin
const MAX_STALE_MIN = 2 * 24 * 60;

const BASE = 'https://sm-cybermap-mediaprod.smweb.tech/data/securelist';
const COUNTRIES_URL = 'https://cybermap.kaspersky.com/map/data/countries.json';
const UA = 'worldmonitor-kaspersky-cybermap-seed/1.0';
const PERIOD = 'w';

// Detection subsystems, in the order the Kaspersky stats page lists them.
export const SUBSYSTEMS = [
  { id: 'OAS', label: 'On-Access Scan' },
  { id: 'ODS', label: 'On-Demand Scan' },
  { id: 'MAV', label: 'Mail Anti-Virus' },
  { id: 'WAV', label: 'Web Anti-Virus' },
  { id: 'IDS', label: 'Intrusion Detection' },
  { id: 'VUL', label: 'Vulnerability Scan' },
  { id: 'KAS', label: 'Anti-Spam' },
  { id: 'RMW', label: 'Ransomware' },
];

// Kaspersky lists French overseas departments separately; the shared map
// (built from the country geojson) folds them into France.
const ISO2_SUPPLEMENT = { REU: 'RE', MTQ: 'MQ', GLP: 'GP', GUF: 'GF', BES: 'BQ', MYT: 'YT' };

async function getJson(url, attempts = 2) {
  try {
    return await getJsonOnce(url);
  } catch (err) {
    if (attempts <= 1) throw err;
    await new Promise((r) => setTimeout(r, 1000));
    return getJson(url, attempts - 1);
  }
}

async function getJsonOnce(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`);
  // A missing file comes back as the site's 200 HTML 404 page, not a 404.
  const text = await resp.text();
  if (!/^\s*[[{]/.test(text)) throw new Error(`non-JSON body ${url}`);
  return JSON.parse(text);
}

/** Kaspersky numeric country id -> ISO3, from entries named MAP_COUNTRY_<ISO3>. */
export function parseCountryIndex(rows) {
  const out = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const m = /^MAP_COUNTRY_([A-Z]{3})$/.exec(String(row?.name ?? ''));
    if (m && Number.isFinite(row?.key) && row.key !== 0) out.set(String(row.key), m[1]);
  }
  return out;
}

export function buildCountryRanking(raw, countryIndex, iso3ToIso2) {
  const rows = [];
  for (const [id, value] of Object.entries(raw ?? {})) {
    const iso3 = countryIndex.get(id);
    const pct = Number(value);
    if (!iso3 || !Number.isFinite(pct)) continue;
    rows.push({ iso3, iso2: iso3ToIso2[iso3] ?? ISO2_SUPPLEMENT[iso3] ?? '', pct });
  }
  rows.sort((a, b) => b.pct - a.pct);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function parseTrend(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((p) => ({ date: String(p?.date ?? ''), count: Number(p?.count) }))
    .filter((p) => p.date && Number.isFinite(p.count));
}

export function parseTopThreats(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((p) => ({ name: String(p?.name ?? ''), pct: Number(p?.percent) }))
    .filter((p) => p.name && Number.isFinite(p.pct));
}

async function fetchSubsystem(sub, countryIndex, iso3ToIso2) {
  const code = sub.id.toLowerCase();
  const [countries, graph, top10] = await Promise.allSettled([
    getJson(`${BASE}/country_${code}_${PERIOD}.json`),
    getJson(`${BASE}/graph_${code}_${PERIOD}_0.json`),
    getJson(`${BASE}/top10_${code}_${PERIOD}_0.json`),
  ]);
  for (const r of [countries, graph, top10]) {
    if (r.status === 'rejected') console.warn(`  [kaspersky] ${sub.id}: ${r.reason?.message ?? r.reason}`);
  }
  return {
    id: sub.id,
    label: sub.label,
    countries: countries.status === 'fulfilled' ? buildCountryRanking(countries.value, countryIndex, iso3ToIso2) : [],
    trend: graph.status === 'fulfilled' ? parseTrend(graph.value) : [],
    topThreats: top10.status === 'fulfilled' ? parseTopThreats(top10.value) : [],
  };
}

export async function fetchKasperskyStats() {
  const countryIndex = parseCountryIndex(await getJson(COUNTRIES_URL));
  if (countryIndex.size < 100) throw new Error(`country index too small (${countryIndex.size})`);
  const iso3ToIso2 = loadSharedConfig('iso3-to-iso2.json');

  const subsystems = [];
  // Sequential: 8 × 3 small files, and the bucket is Kaspersky's public CDN —
  // no reason to burst it.
  for (const sub of SUBSYSTEMS) subsystems.push(await fetchSubsystem(sub, countryIndex, iso3ToIso2));

  return {
    source: 'Kaspersky Cyberthreat Real-Time Map (KSN telemetry)',
    sourceUrl: 'https://cybermap.kaspersky.com/stats',
    period: PERIOD,
    fetchedAt: new Date().toISOString(),
    subsystems,
  };
}

export function declareRecords(data) {
  return (data?.subsystems ?? []).filter((s) => s.countries?.length > 0).length;
}

// At least half the subsystems must carry a country ranking; a wholesale
// upstream change (moved bucket, renamed files) then fails loud instead of
// publishing an empty panel over last-good data.
export function validate(data) {
  return declareRecords(data) >= SUBSYSTEMS.length / 2;
}

const isMain = process.argv[1]?.endsWith('seed-kaspersky-cybermap.mjs');

if (isMain) {
  runSeed('cyber', 'kaspersky-stats', KASPERSKY_CYBERMAP_KEY, fetchKasperskyStats, {
    validateFn: validate,
    ttlSeconds: CACHE_TTL,
    recordCount: declareRecords,
    declareRecords,
    sourceVersion: 'kaspersky-cybermap-securelist-v1',
    schemaVersion: 1,
    maxStaleMin: MAX_STALE_MIN,
    emptyDataIsFailure: true,
  }).catch((err) => {
    const cause = err.cause ? ` (cause: ${err.cause.message || err.cause.code || err.cause})` : '';
    console.error('FATAL:', (err.message || err) + cause);
    process.exit(1);
  });
}
