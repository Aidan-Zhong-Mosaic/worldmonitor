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
import { track } from '@/services/analytics';

const API_PATH = '/api/summarize-page';

let overlay: HTMLElement | null = null;
let abortController: AbortController | null = null;

interface SummarizeResponse {
  summary?: string;
  error?: string;
}

function formatGeneratedAt(date: Date): string {
  try {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return date.toISOString();
  }
}

async function requestSummary(signal: AbortSignal): Promise<{ ok: true; summary: string } | { ok: false; message: string }> {
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

  return { ok: true, summary: body.summary };
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

function renderSummary(bodyEl: HTMLElement, summary: string): void {
  const p = document.createElement('p');
  p.className = 'summarize-page-summary';
  p.textContent = summary;
  bodyEl.replaceChildren(p);
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
      renderSummary(bodyEl, result.summary);
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
