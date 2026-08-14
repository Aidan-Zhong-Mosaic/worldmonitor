#!/usr/bin/env node
/**
 * Generates src/config/mosaic/generated.ts from the two hand-maintained CSVs:
 *   src/config/mosaic/lob2panels.csv     — panel key x line of business
 *   src/config/mosaic/lob2maplayers.csv  — map layer key x line of business
 *
 * Cell values: `ON` (enabled by default), `avail` (available, off by default),
 * empty (not offered for that LOB).
 *
 * The CSVs are the source of truth. Re-run after editing either one:
 *   npm run generate:mosaic
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mosaicDir = path.join(root, 'src', 'config', 'mosaic');

/** Column header -> stable LOB id. Order here is the header display order. */
const LOB_IDS = {
  'Political violence': 'political-violence',
  'Cyber': 'cyber',
  'Political risk': 'political-risk',
  'Transactional liability': 'transactional-liability',
  'Financial institutions': 'financial-institutions',
  'Professional liability': 'professional-liability',
  'Environmental liability': 'environmental-liability',
  'Specialty casualty': 'specialty-casualty',
};

/**
 * A ninth line that is deliberately NOT a column in either CSV: it offers every
 * panel and every layer the CSVs know about, as the catalogue/exploration view.
 * Synthesizing it keeps it complete for free — a hand-maintained column would
 * need 215 `avail` cells today and one more for every panel or layer added
 * later, and would silently fall behind the moment someone forgot.
 *
 * The two halves are deliberately asymmetric:
 *   - PANELS are all ON. The grid is a vertical list, so "everything at once"
 *     is a long scroll rather than a mess, and that is the point of the page.
 *   - LAYERS are all OFF but offered. They composite onto one map, and 56
 *     simultaneous overlays is an unreadable map, not a catalogue.
 */
const ALL_LINES_ID = 'all-lines';
/** `null` means "every key in the CSV" — see synthesizeAllLines. */
const ALL_LINES_PANELS_ON = null;
const ALL_LINES_LAYERS_ON = [];

function parse(file) {
  const text = fs.readFileSync(path.join(mosaicDir, file), 'utf8').trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split(',').map((h) => h.trim());
  const lobCols = headers.slice(1);

  for (const col of lobCols) {
    if (!LOB_IDS[col]) throw new Error(`${file}: unknown LOB column "${col}"`);
  }

  const selections = {};
  for (const col of lobCols) selections[LOB_IDS[col]] = { on: [], avail: [] };
  /** Every row key, in CSV order — the input to the synthetic all-lines entry. */
  const keys = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split(',');
    if (cells.length !== headers.length) {
      throw new Error(`${file}: row "${cells[0]}" has ${cells.length} cells, expected ${headers.length}`);
    }
    const key = cells[0].trim();
    if (!key) continue;
    keys.push(key);
    lobCols.forEach((col, i) => {
      const v = cells[i + 1].trim();
      if (!v) return;
      if (v !== 'ON' && v !== 'avail') {
        throw new Error(`${file}: row "${key}" column "${col}" has invalid value "${v}" (expected ON, avail, or empty)`);
      }
      selections[LOB_IDS[col]][v === 'ON' ? 'on' : 'avail'].push(key);
    });
  }
  return { selections, keys };
}

/**
 * Build the all-lines entry: `on` as declared (or every key when `null`),
 * everything else `avail`. The membership check is the guard that matters — a
 * renamed or deleted key would otherwise drop out of `on` silently, and a page
 * that quietly stops showing something is indistinguishable from a broken one.
 */
function synthesizeAllLines(file, keys, on) {
  if (on === null) return { on: [...keys], avail: [] };
  const missing = on.filter((key) => !keys.includes(key));
  if (missing.length > 0) {
    throw new Error(`${file}: all-lines default-on key(s) absent from the CSV: ${missing.join(', ')}`);
  }
  return { on: [...on], avail: keys.filter((key) => !on.includes(key)) };
}

const panelsCsv = parse('lob2panels.csv');
const layersCsv = parse('lob2maplayers.csv');

const panels = {
  ...panelsCsv.selections,
  [ALL_LINES_ID]: synthesizeAllLines('lob2panels.csv', panelsCsv.keys, ALL_LINES_PANELS_ON),
};
const layers = {
  ...layersCsv.selections,
  [ALL_LINES_ID]: synthesizeAllLines('lob2maplayers.csv', layersCsv.keys, ALL_LINES_LAYERS_ON),
};

const ids = [...Object.values(LOB_IDS), ALL_LINES_ID];
const lit = (arr) => (arr.length ? `[${arr.map((s) => `'${s}'`).join(', ')}]` : '[]');
const block = (data) =>
  ids
    .map((id) => `  '${id}': {\n    on: ${lit(data[id].on)},\n    avail: ${lit(data[id].avail)},\n  },`)
    .join('\n');

const out = `// GENERATED FILE — DO NOT EDIT.
// Source: src/config/mosaic/lob2panels.csv, src/config/mosaic/lob2maplayers.csv
// Regenerate with: npm run generate:mosaic
//
// '${ALL_LINES_ID}' has no CSV column: it is synthesized from every row in both
// files (see ALL_LINES_* in scripts/generate-mosaic-config.mjs) so the
// catalogue view stays complete without hand-maintained cells.
import type { MapLayers } from '@/types';

export const LOB_IDS = [
${ids.map((id) => `  '${id}',`).join('\n')}
] as const;

export type LobId = (typeof LOB_IDS)[number];

export interface LobSelection<T extends string = string> {
  /** Offered and enabled by default. */
  on: readonly T[];
  /** Offered but off by default — user can turn it on. */
  avail: readonly T[];
}

export const LOB_PANELS: Record<LobId, LobSelection> = {
${block(panels)}
};

export const LOB_LAYERS: Record<LobId, LobSelection<keyof MapLayers>> = {
${block(layers)}
};
`;

fs.writeFileSync(path.join(mosaicDir, 'generated.ts'), out);

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('LOB', 26) + 'panels ON/avail'.padStart(18) + 'layers ON/avail'.padStart(18));
for (const id of ids) {
  console.log(
    pad(id, 26) +
      `${panels[id].on.length}/${panels[id].avail.length}`.padStart(18) +
      `${layers[id].on.length}/${layers[id].avail.length}`.padStart(18),
  );
}
console.log('\nwrote src/config/mosaic/generated.ts');
