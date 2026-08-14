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

function parse(file) {
  const text = fs.readFileSync(path.join(mosaicDir, file), 'utf8').trim();
  const [headerLine, ...lines] = text.split(/\r?\n/);
  const headers = headerLine.split(',').map((h) => h.trim());
  const lobCols = headers.slice(1);

  for (const col of lobCols) {
    if (!LOB_IDS[col]) throw new Error(`${file}: unknown LOB column "${col}"`);
  }

  const result = {};
  for (const col of lobCols) result[LOB_IDS[col]] = { on: [], avail: [] };

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = line.split(',');
    if (cells.length !== headers.length) {
      throw new Error(`${file}: row "${cells[0]}" has ${cells.length} cells, expected ${headers.length}`);
    }
    const key = cells[0].trim();
    if (!key) continue;
    lobCols.forEach((col, i) => {
      const v = cells[i + 1].trim();
      if (!v) return;
      if (v !== 'ON' && v !== 'avail') {
        throw new Error(`${file}: row "${key}" column "${col}" has invalid value "${v}" (expected ON, avail, or empty)`);
      }
      result[LOB_IDS[col]][v === 'ON' ? 'on' : 'avail'].push(key);
    });
  }
  return result;
}

const panels = parse('lob2panels.csv');
const layers = parse('lob2maplayers.csv');

const ids = Object.values(LOB_IDS);
const lit = (arr) => (arr.length ? `[${arr.map((s) => `'${s}'`).join(', ')}]` : '[]');
const block = (data) =>
  ids
    .map((id) => `  '${id}': {\n    on: ${lit(data[id].on)},\n    avail: ${lit(data[id].avail)},\n  },`)
    .join('\n');

const out = `// GENERATED FILE — DO NOT EDIT.
// Source: src/config/mosaic/lob2panels.csv, src/config/mosaic/lob2maplayers.csv
// Regenerate with: npm run generate:mosaic
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
