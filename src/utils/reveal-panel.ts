/**
 * Scroll a dashboard panel into view and flash the search highlight on it.
 *
 * This is the same reveal behaviour the command palette uses when you pick a
 * panel (src/app/search-manager.ts `scrollToPanel` / `applyHighlight` /
 * `scrollToPanelWhenReady`), lifted into a util so other surfaces — currently
 * the AI Summary modal's panel links — can reuse it instead of duplicating the
 * retry + highlight contract.
 *
 * The retry matters: premium and below-the-fold panels are deferred shells
 * until they mount. Scrolling to the shell is what trips the IntersectionObserver
 * that hydrates the real panel, so we scroll to whatever carries the
 * `data-panel` attribute and re-check briefly until it exists.
 */

const HIGHLIGHT_CLASS = 'search-highlight';
/** Matches the .search-highlight animation duration in main.css. */
const HIGHLIGHT_MS = 3100;
const RETRY_MS = 80;
const DEFAULT_ATTEMPTS = 12;

const highlightTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

function applyHighlight(el: Element): void {
  const prev = highlightTimers.get(el);
  if (prev) clearTimeout(prev);
  el.classList.remove(HIGHLIGHT_CLASS);
  // Force a reflow so re-adding the class restarts the animation when the
  // same panel is revealed twice in a row.
  void (el as HTMLElement).offsetWidth;
  el.classList.add(HIGHLIGHT_CLASS);
  highlightTimers.set(el, setTimeout(() => {
    el.classList.remove(HIGHLIGHT_CLASS);
    highlightTimers.delete(el);
  }, HIGHLIGHT_MS));
}

/**
 * Reveal the panel with the given `data-panel` id. Returns true if the panel
 * was already in the DOM; false when it wasn't (a retry is scheduled, so the
 * reveal may still land shortly after).
 */
export function revealPanel(panelId: string, attemptsLeft = DEFAULT_ATTEMPTS): boolean {
  if (typeof document === 'undefined' || !panelId) return false;

  const panel = document.querySelector(`[data-panel="${CSS.escape(panelId)}"]`);
  if (panel) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    applyHighlight(panel);
    return true;
  }

  if (attemptsLeft > 0) {
    setTimeout(() => revealPanel(panelId, attemptsLeft - 1), RETRY_MS);
  }
  return false;
}
