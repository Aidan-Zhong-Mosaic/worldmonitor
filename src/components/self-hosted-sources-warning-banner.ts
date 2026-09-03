/**
 * Self-hosted-only notice: the open-source data sources this build pulls from
 * have not been individually vetted one by one yet (that audit is still in
 * progress) — flag it to whoever is standing up their own instance so they
 * don't treat every feed as fully verified. Never shown on the hosted
 * worldmonitor.app product.
 */

import { isSelfHostedPremiumUnlocked } from '@/services/self-hosted-unlock';
import { t } from '@/services/i18n';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';

const BANNER_ID = 'self-hosted-sources-warning-banner';
const DISMISS_KEY = 'wm-self-hosted-sources-warning-dismissed';

export function initSelfHostedSourcesWarningBanner(): void {
  if (!isSelfHostedPremiumUnlocked()) return;
  if (document.getElementById(BANNER_ID)) return;

  try {
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
  } catch { /* noop */ }

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  Object.assign(banner.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '99998',
    padding: '10px 20px',
    background: '#b45309',
    color: '#fff',
    fontSize: '13px',
    textAlign: 'center',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  });

  setTrustedHtml(banner, trustedHtml(`
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <span>${t('components.selfHostedSourcesWarning.message')}</span>
    <button id="wm-shsw-dismiss-btn" style="background:transparent;color:#fff;border:none;cursor:pointer;font-size:calc(18px * var(--wm-panel-effective-scale, 1));padding:0 4px;line-height:1;">&times;</button>
  `, "self-hosted sources warning banner"));

  document.body.appendChild(banner);

  document.getElementById('wm-shsw-dismiss-btn')?.addEventListener('click', () => {
    banner.remove();
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
  });
}