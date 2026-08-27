/**
 * Collects the text currently visible in the dashboard's panel grid, for the
 * "AI Summary" button (see SummarizePageButton.ts / SummarizePageModal.ts).
 *
 * This deliberately reads the rendered DOM rather than each panel's internal
 * data model: the dashboard has 40+ independently addable/removable panel
 * types (src/app/panel-layout.ts) and no shared structured-data interface
 * across them (Panel.ts is UI chrome only). Reading rendered text is the one
 * approach that covers every panel type today — including ones added after
 * this file was written — without touching each panel component.
 *
 * Caps here mirror (and are re-enforced independently by) api/summarize-page.ts
 * — never trust only one side of that pair to stay in sync.
 */

export interface CollectedPanel {
  title: string;
  text: string;
}

const PANEL_GRID_SELECTOR = '#panelsGrid';
const MAX_PANELS = 24;
const MAX_TITLE_CHARS = 80;
const MAX_TEXT_CHARS_PER_PANEL = 600;

// Interactive/decorative chrome to strip out of a panel's content before
// reading its text — button labels, resize handles, icon glyphs, and the
// locked-panel upsell copy would otherwise pollute the summary with noise
// ("Upgrade to Pro", "Show more") instead of actual panel content.
const CHROME_SELECTOR = [
  'button',
  '.panel-resize-handle',
  '.panel-col-resize-handle',
  '.panel-locked-state',
  'svg',
  '[aria-hidden="true"]',
].join(', ');

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractPanelBodyText(contentEl: Element): string {
  const clone = contentEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(CHROME_SELECTOR).forEach((el) => el.remove());
  return normalizeWhitespace(clone.textContent ?? '');
}

/**
 * Whether a panel element should count as "on screen" right now: mounted,
 * not collapsed, not showing a Pro-locked upsell state (nothing real to
 * summarize there), and actually rendered (not display:none via a hidden
 * settings toggle or an unmounted deferred shell).
 */
function isEligiblePanel(panelEl: HTMLElement): boolean {
  if (panelEl.classList.contains('panel-collapsed')) return false;
  if (panelEl.classList.contains('panel-is-locked')) return false;
  if (panelEl.offsetParent === null) return false;
  return true;
}

/**
 * Reads the currently-visible, non-collapsed, non-locked panels out of the
 * dashboard grid and returns compact {title, text} pairs ready to send to
 * /api/summarize-page. Returns [] if the grid isn't present or nothing
 * qualifies (caller should treat that as "nothing to summarize").
 */
export function collectVisiblePanelSummaries(
  gridSelector: string = PANEL_GRID_SELECTOR,
): CollectedPanel[] {
  const grid = document.querySelector(gridSelector);
  if (!grid) return [];

  const panels: CollectedPanel[] = [];
  const candidates = grid.querySelectorAll<HTMLElement>(':scope > .panel');

  for (const panelEl of Array.from(candidates)) {
    if (panels.length >= MAX_PANELS) break;
    if (!isEligiblePanel(panelEl)) continue;

    const titleEl = panelEl.querySelector('.panel-title');
    const contentEl = panelEl.querySelector('.panel-content');
    if (!titleEl || !contentEl) continue;

    const title = normalizeWhitespace(titleEl.textContent ?? '').slice(0, MAX_TITLE_CHARS);
    const text = extractPanelBodyText(contentEl).slice(0, MAX_TEXT_CHARS_PER_PANEL);
    if (!title || !text) continue;

    panels.push({ title, text });
  }

  return panels;
}
