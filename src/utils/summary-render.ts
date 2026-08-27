/**
 * Turns the AI Summary's plain-text answer into DOM, linking each panel name
 * it mentions back to the panel it came from.
 *
 * The model is asked for ranked bullets ("<panel title> — one sentence")
 * followed by a general summary. Rather than constraining it to a machine
 * format (which it drifts from), we match the panel titles we already know we
 * sent against the text it returned. That keeps the prompt free-form and the
 * linking deterministic: a title only becomes a link when it exactly matches a
 * panel that fed this summary.
 *
 * Everything is built with textContent / createElement — never innerHTML —
 * because the summary is model output derived from untrusted panel text.
 */

import { t } from '@/services/i18n';

/** One panel that reached the model, as echoed back by /api/summarize-page. */
export interface SummarySourcePanel {
  /** The panel's `data-panel` id, for revealPanel(). */
  id: string;
  title: string;
}

export interface RenderedSummaryHandlers {
  onPanelClick: (panelId: string) => void;
}

const BULLET_RE = /^\s*(?:[-*•‣]|\d+[.)])\s+/;
/** Markdown emphasis the model sometimes wraps titles in; stripped for display. */
const EMPHASIS_RE = /\*\*|__/g;

interface TitleMatch {
  start: number;
  end: number;
  panel: SummarySourcePanel;
}

/**
 * Find the first panel title occurring in `line`, preferring the longest match
 * so "OIL & GAS PIPELINE STATUS" wins over a shorter title nested inside it.
 */
function findTitleMatch(line: string, panels: SummarySourcePanel[]): TitleMatch | null {
  const haystack = line.toLowerCase();
  let best: TitleMatch | null = null;

  for (const panel of panels) {
    const needle = panel.title.toLowerCase().trim();
    if (!needle) continue;
    const idx = haystack.indexOf(needle);
    if (idx === -1) continue;

    const candidate = { start: idx, end: idx + needle.length, panel };
    const bestLen = best ? best.end - best.start : -1;
    const candLen = candidate.end - candidate.start;
    // Earliest match wins; ties break toward the longer title.
    if (!best || candidate.start < best.start || (candidate.start === best.start && candLen > bestLen)) {
      best = candidate;
    }
  }
  return best;
}

function makePanelLink(
  label: string,
  panel: SummarySourcePanel,
  className: string,
  handlers: RenderedSummaryHandlers,
): HTMLButtonElement {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = className;
  link.textContent = label;
  link.title = t('summarizePage.goToPanel', { panel: label });
  link.addEventListener('click', () => handlers.onPanelClick(panel.id));
  return link;
}

function appendLinkedLine(
  target: HTMLElement,
  line: string,
  panels: SummarySourcePanel[],
  handlers: RenderedSummaryHandlers,
): void {
  const match = findTitleMatch(line, panels);
  if (!match) {
    target.appendChild(document.createTextNode(line));
    return;
  }

  const before = line.slice(0, match.start);
  const label = line.slice(match.start, match.end);
  const after = line.slice(match.end);

  if (before) target.appendChild(document.createTextNode(before));
  target.appendChild(makePanelLink(label, match.panel, 'summarize-page-panel-link', handlers));
  if (after) target.appendChild(document.createTextNode(after));
}

/**
 * Render `summary` into a fresh element tree. Bullet lines become list items
 * with the panel name linked; everything else becomes paragraphs.
 */
export function renderSummaryBody(
  summary: string,
  panels: SummarySourcePanel[],
  handlers: RenderedSummaryHandlers,
): DocumentFragment {
  const frag = document.createDocumentFragment();
  const lines = summary.replace(EMPHASIS_RE, '').split('\n');

  let list: HTMLUListElement | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      list = null;
      continue;
    }

    const bulletPrefix = line.match(BULLET_RE);
    if (bulletPrefix) {
      if (!list) {
        list = document.createElement('ul');
        list.className = 'summarize-page-bullets';
        frag.appendChild(list);
      }
      const li = document.createElement('li');
      appendLinkedLine(li, line.slice(bulletPrefix[0].length), panels, handlers);
      list.appendChild(li);
      continue;
    }

    list = null;
    const p = document.createElement('p');
    p.className = 'summarize-page-paragraph';
    // Prose can name a panel too — link it there as well.
    appendLinkedLine(p, line, panels, handlers);
    frag.appendChild(p);
  }

  return frag;
}

/**
 * The "what did this read?" row: every panel that actually reached the model,
 * each one a link to that panel.
 */
export function renderSourceList(
  panels: SummarySourcePanel[],
  handlers: RenderedSummaryHandlers,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'summarize-page-sources';

  const label = document.createElement('span');
  label.className = 'summarize-page-sources-label';
  label.textContent = t('summarizePage.sourcesLabel', { count: panels.length });
  wrap.appendChild(label);

  for (const panel of panels) {
    wrap.appendChild(makePanelLink(panel.title, panel, 'summarize-page-source-chip', handlers));
  }

  return wrap;
}
