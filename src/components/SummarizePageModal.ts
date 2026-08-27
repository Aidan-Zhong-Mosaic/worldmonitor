/**
 * "AI Summary" modal — the free-for-all, one-click summary of whatever
 * panels are currently on the user's dashboard.
 *
 * Pattern mirrors WidgetChatModal.ts (module-scoped overlay singleton,
 * .modal-overlay/.modal base classes) but is a plain fetch/response flow,
 * not a chat: one request in, one summary out, with a Refresh action.
 *
 * Unlike /api/chat-analyst, this endpoint is public — no Clerk auth, no Pro
 * gate, no per-user quota. See api/summarize-page.ts for the cost controls
 * that make that safe (scoped per-IP rate limit, cheap non-reasoning model,
 * hard payload caps).
 */

import { t } from '@/services/i18n';
import { toApiUrl } from '@/services/runtime';
import { escapeHtml } from '@/utils/sanitize';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import { collectVisiblePanelSummaries } from '@/utils/panel-summary-collector';
import { revealPanel } from '@/utils/reveal-panel';
import {
  renderSourceList,
  renderSummaryBody,
  type SummarySourcePanel,
} from '@/utils/summary-render';
import { track } from '@/services/analytics';

const API_PATH = '/api/summarize-page';

let overlay: HTMLElement | null = null;
let abortController: AbortController | null = null;

interface SummarizeResponse {
  summary?: string;
  /** Panels that actually reached the model, echoed back so the summary can
   *  link each panel it names. */
  panels?: SummarySourcePanel[];
  error?: string;
}

interface SummaryResult {
  summary: string;
  panels: SummarySourcePanel[];
}

function readSourcePanels(value: unknown): SummarySourcePanel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.title !== 'string') return [];
    if (!e.id || !e.title) return [];
    return [{ id: e.id, title: e.title }];
  });
}

function formatGeneratedAt(date: Date): string {
  try {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return date.toISOString();
  }
}

async function requestSummary(signal: AbortSignal): Promise<{ ok: true; result: SummaryResult } | { ok: false; message: string }> {
  const panels = collectVisiblePanelSummaries();
  if (panels.length === 0) {
    return { ok: false, message: t('summarizePage.emptyState') };
  }

  let res: Response;
  try {
    res = await fetch(toApiUrl(API_PATH), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ panels }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return { ok: false, message: t('summarizePage.unavailable') };
  }

  if (res.status === 429) {
    return { ok: false, message: t('summarizePage.rateLimited') };
  }
  if (!res.ok) {
    return { ok: false, message: t('summarizePage.unavailable') };
  }

  let body: SummarizeResponse;
  try {
    body = await res.json();
  } catch {
    return { ok: false, message: t('summarizePage.unavailable') };
  }

  if (!body.summary) {
    return { ok: false, message: t('summarizePage.unavailable') };
  }

  return { ok: true, result: { summary: body.summary, panels: readSourcePanels(body.panels) } };
}

function renderLoading(bodyEl: HTMLElement): void {
  setTrustedHtml(bodyEl, trustedHtml(
    `<div class="summarize-page-loading">${escapeHtml(t('common.loading'))}</div>`,
    'summarize-page loading state',
  ));
}

function renderError(bodyEl: HTMLElement, message: string): void {
  setTrustedHtml(bodyEl, trustedHtml(
    `<div class="summarize-page-error">${escapeHtml(message)}</div>`,
    'summarize-page error state',
  ));
}

function renderSummary(bodyEl: HTMLElement, result: SummaryResult): void {
  // Clicking any panel name closes the modal first — the panel is behind it,
  // and revealPanel() scrolls the dashboard, not the overlay.
  const handlers = {
    onPanelClick: (panelId: string) => {
      closeSummarizePageModal();
      revealPanel(panelId);
      track('summarize-page-drilldown', { panelId });
    },
  };

  const wrap = document.createElement('div');
  wrap.className = 'summarize-page-summary';
  wrap.appendChild(renderSummaryBody(result.summary, result.panels, handlers));
  if (result.panels.length > 0) {
    wrap.appendChild(renderSourceList(result.panels, handlers));
  }
  bodyEl.replaceChildren(wrap);
}

async function runSummary(bodyEl: HTMLElement, metaEl: HTMLElement, refreshBtn: HTMLButtonElement): Promise<void> {
  abortController?.abort();
  const controller = new AbortController();
  abortController = controller;

  refreshBtn.disabled = true;
  metaEl.textContent = '';
  renderLoading(bodyEl);

  try {
    const result = await requestSummary(controller.signal);
    if (controller.signal.aborted) return;

    if (result.ok) {
      renderSummary(bodyEl, result.result);
      metaEl.textContent = t('summarizePage.generatedAt', { time: formatGeneratedAt(new Date()) });
      track('summarize-page-success');
    } else {
      renderError(bodyEl, result.message);
      track('summarize-page-error', { message: result.message });
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    renderError(bodyEl, t('summarizePage.unavailable'));
  } finally {
    if (!controller.signal.aborted) refreshBtn.disabled = false;
  }
}

export function closeSummarizePageModal(): void {
  abortController?.abort();
  abortController = null;
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

export function openSummarizePageModal(): void {
  closeSummarizePageModal();
  track('summarize-page-open');

  overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';

  const modal = document.createElement('div');
  modal.className = 'modal summarize-page-modal';

  setTrustedHtml(modal, trustedHtml(`
    <div class="modal-header">
      <span class="modal-title">${escapeHtml(t('summarizePage.modalTitle'))}</span>
      <button class="modal-close" aria-label="${escapeHtml(t('common.close'))}">✕</button>
    </div>
    <div class="summarize-page-body"></div>
    <div class="summarize-page-footer">
      <span class="summarize-page-meta"></span>
      <button class="summarize-page-refresh">${escapeHtml(t('common.refresh'))}</button>
    </div>
  `, 'summarize-page modal shell'));

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const bodyEl = modal.querySelector('.summarize-page-body') as HTMLElement;
  const metaEl = modal.querySelector('.summarize-page-meta') as HTMLElement;
  const refreshBtn = modal.querySelector('.summarize-page-refresh') as HTMLButtonElement;
  const closeBtn = modal.querySelector('.modal-close') as HTMLButtonElement;

  closeBtn.addEventListener('click', closeSummarizePageModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSummarizePageModal(); });
  refreshBtn.addEventListener('click', () => { void runSummary(bodyEl, metaEl, refreshBtn); });

  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') closeSummarizePageModal();
  };
  document.addEventListener('keydown', onKeydown, { once: true });

  void runSummary(bodyEl, metaEl, refreshBtn);
}
