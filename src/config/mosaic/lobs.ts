/**
 * Lines of business — the top-level dashboard selector that replaces the
 * public variant switcher in this deployment.
 *
 * A LOB id is registered as a variant id (see panels.ts VARIANT_PANEL_CONFIGS
 * and map-layer-definitions.ts VARIANT_LAYER_ORDER), so the whole existing
 * variant machinery — panel seeding, layer gating, the switch-and-reset path in
 * App.ts — works on a LOB with no special-casing. The six public variants stay
 * registered alongside them; they are simply no longer rendered in the header.
 *
 * Panel/layer membership is generated from the two CSVs in this directory.
 * Edit those, then run `npm run generate:mosaic`.
 */
import type { MapLayers } from '@/types';
import { LOB_IDS, LOB_LAYERS, LOB_PANELS, type LobId } from './generated';

export { LOB_IDS, LOB_LAYERS, LOB_PANELS };
export type { LobId };

export interface LobMeta {
  id: LobId;
  /** Full name, used for tooltips and settings. */
  label: string;
  /** Compact name for the header switcher — nine of these share one row. */
  shortLabel: string;
  icon: string;
}

export const LOBS: readonly LobMeta[] = [
  { id: 'political-violence',      label: 'Political Violence',      shortLabel: 'Pol. Violence', icon: '💥' },
  { id: 'cyber',                   label: 'Cyber',                   shortLabel: 'Cyber',         icon: '🔐' },
  { id: 'political-risk',          label: 'Political Risk',          shortLabel: 'Pol. Risk',     icon: '🏛️' },
  { id: 'transactional-liability', label: 'Transactional Liability', shortLabel: 'Transactional', icon: '🤝' },
  { id: 'financial-institutions',  label: 'Financial Institutions',  shortLabel: 'Fin. Inst.',    icon: '🏦' },
  { id: 'professional-liability',  label: 'Professional Liability',  shortLabel: 'Professional',  icon: '⚖️' },
  { id: 'environmental-liability', label: 'Environmental Liability', shortLabel: 'Environmental', icon: '🌿' },
  { id: 'specialty-casualty',      label: 'Specialty Casualty',      shortLabel: 'Casualty',      icon: '🛡️' },
  // Catalogue view, last in the row: every panel and every layer this build
  // knows about. Not an underwriting line — it is the "show me everything that
  // exists" surface for demos and for deciding what belongs in a real LOB.
  { id: 'all-lines',               label: 'All Panels & Layers',     shortLabel: 'All',           icon: '🌐' },
] as const;

/** The catalogue LOB — offers everything, turns on almost nothing. */
export const ALL_LINES_LOB: LobId = 'all-lines';

/** The LOB a fresh install lands on. */
export const DEFAULT_LOB: LobId = 'political-violence';

const LOB_ID_SET: ReadonlySet<string> = new Set(LOB_IDS);

export function isLobId(value: string | null | undefined): value is LobId {
  return typeof value === 'string' && LOB_ID_SET.has(value);
}

export function getLobMeta(id: string): LobMeta | undefined {
  return LOBS.find((l) => l.id === id);
}

/** Every panel/layer a LOB offers, default-on first. */
function offered<T extends string>(sel: { on: readonly T[]; avail: readonly T[] }): T[] {
  return [...sel.on, ...sel.avail];
}

/** Panel keys a LOB offers, in canonical order (enabled ones first). */
export function getLobPanelKeys(lob: LobId): string[] {
  return offered(LOB_PANELS[lob]);
}

/** Panel keys a LOB enables by default. */
export function getLobEnabledPanelKeys(lob: LobId): ReadonlySet<string> {
  return new Set(LOB_PANELS[lob].on);
}

/** Map layer keys a LOB offers — drives the layer picker and the variant gate. */
export function getLobLayerKeys(lob: LobId): Array<keyof MapLayers> {
  return offered(LOB_LAYERS[lob]);
}

/** Layer keys a LOB turns on by default. */
export function getLobEnabledLayerKeys(lob: LobId): ReadonlySet<keyof MapLayers> {
  return new Set(LOB_LAYERS[lob].on);
}
