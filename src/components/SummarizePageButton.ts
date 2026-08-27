/**
 * Small header widget that opens the "AI Summary" modal.
 *
 * Mirrors ExportPanel's shape (src/utils/export.ts) — a tiny class with
 * getElement(), instantiated once and appended into .header-right by
 * setupSummarizePageButton() in src/app/event-handlers.ts.
 */

import { t } from '@/services/i18n';
import { escapeHtml } from '@/utils/sanitize';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import { openSummarizePageModal } from './SummarizePageModal';

export class SummarizePageButton {
  private element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'summarize-page-btn-container';
    setTrustedHtml(this.element, trustedHtml(`
      <button class="summarize-page-btn" title="${escapeHtml(t('summarizePage.buttonTitle'))}">
        ✨ ${escapeHtml(t('summarizePage.buttonLabel'))}
      </button>
    `, 'summarize-page header trigger'));

    const btn = this.element.querySelector('.summarize-page-btn') as HTMLButtonElement;
    btn.addEventListener('click', () => openSummarizePageModal());
  }

  public getElement(): HTMLElement {
    return this.element;
  }
}
