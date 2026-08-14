/**
 * Every variant a user can switch to. One desktop binary ships and switches
 * between all of these in-app (#5908), so this list is also the set
 * `/api/download` accepts — `tests/desktop-one-binary-model.test.mjs` fails if
 * the two drift apart.
 */
export const SITE_VARIANTS = ['full', 'tech', 'finance', 'happy', 'commodity', 'energy'] as const;

export type SiteVariant = (typeof SITE_VARIANTS)[number];

export function isSiteVariant(value: string | null | undefined): value is SiteVariant {
  return typeof value === 'string' && (SITE_VARIANTS as readonly string[]).includes(value);
}

/**
 * Lines of business are registered as variants (see src/config/mosaic/lobs.ts)
 * and are what the header switcher actually offers in this deployment. They are
 * deliberately NOT in SITE_VARIANTS: that list is the desktop one-binary /
 * `/api/download` contract, which only covers the six public web variants.
 * Inlined rather than imported so this module keeps zero internal imports and
 * stays free of a cycle with panels.ts.
 */
const LOB_VARIANTS = [
  'political-violence', 'cyber', 'political-risk', 'transactional-liability',
  'financial-institutions', 'professional-liability', 'environmental-liability',
  'specialty-casualty',
  // Catalogue view — every panel and layer, almost all default-off.
  'all-lines',
] as const;

/** A variant id that may be selected and persisted — public variant or LOB. */
export function isSelectableVariant(value: string | null | undefined): boolean {
  return isSiteVariant(value)
    || (typeof value === 'string' && (LOB_VARIANTS as readonly string[]).includes(value));
}

/** Landing LOB for a fresh install. Mirrors DEFAULT_LOB in mosaic/lobs.ts. */
const DEFAULT_LOB_VARIANT = 'political-violence';

// No VITE_VARIANT means an unconfigured build, which in this deployment lands on
// a LOB rather than the upstream 'full' dashboard. `npm run dev:tech` and the
// other per-variant scripts set VITE_VARIANT explicitly and are unaffected.
const buildVariant = (() => {
  try {
    return import.meta.env.VITE_VARIANT || DEFAULT_LOB_VARIANT;
  } catch {
    return DEFAULT_LOB_VARIANT;
  }
})();

function loadStoredVariant(): string | null {
  try {
    return localStorage.getItem('worldmonitor-variant');
  } catch {
    return null;
  }
}

export const SITE_VARIANT: string = (() => {
  if (typeof window === 'undefined') return buildVariant;

  // A stored selection wins everywhere. LOBs have no subdomain of their own, so
  // unlike the public variants they can only be resolved from storage — the
  // hostname checks below would otherwise pin every LOB user to 'full'.
  const stored = loadStoredVariant();
  if (isSelectableVariant(stored)) return stored as string;

  const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
  if (isTauri) return buildVariant;

  const h = location.hostname;
  if (h.startsWith('tech.')) return 'tech';
  if (h.startsWith('finance.')) return 'finance';
  if (h.startsWith('happy.')) return 'happy';
  if (h.startsWith('commodity.')) return 'commodity';
  if (h.startsWith('energy.')) return 'energy';

  if (h === 'localhost' || h === '127.0.0.1') return buildVariant;

  return DEFAULT_LOB_VARIANT;
})();
