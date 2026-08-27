import { Panel } from './Panel';
import { SITE_VARIANT } from '@/config';
import { getLobMeta } from '@/config/mosaic/lobs';
import { h, replaceChildren } from '@/utils/dom-utils';
import { revealPanel } from '@/utils/reveal-panel';
import { track } from '@/services/analytics';
import {
  buildModelPayload, matchPolicy, matcherFor, normalizePolicy, parsePortfolioTsv,
  type NormalizedPolicy, type PolicyMatch, type WorldEvent,
} from '../../shared/exposure/exposure-core';
import { DEMO_EVENTS } from '../../shared/exposure/demo-events';

/**
 * Portfolio Exposure — the Exposure Lens surface inside the dashboard.
 *
 * Shows which policies in the book a current world event may touch, filtered to
 * whichever line of business the header switcher has selected. Every card links
 * back to the panel the event came from, so an underwriter can go straight from
 * "we are exposed" to the underlying signal.
 *
 * Matching runs here, against a portfolio the browser loads inside your own
 * network. No policy data is sent anywhere: `buildModelPayload` is the single
 * choke point for anything that would reach a model, and this panel only ever
 * reads the redacted cohort back out of it.
 */

const PORTFOLIO_URL = '/exposure-demo/portfolio.tsv';
const MAX_ROWS_PER_CARD = 4;

interface ExposureCard {
  event: WorldEvent;
  hits: PolicyMatch[];
  policyCount: number;
  netExposureUsd: number;
  aggregateLimitUsd: number;
}

function money(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}bn`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export class PortfolioExposurePanel extends Panel {
  private policies: NormalizedPolicy[] = [];
  private loaded = false;

  constructor() {
    super({
      id: 'portfolio-exposure',
      title: 'Portfolio Exposure',
      showCount: true,
      defaultRowSpan: 2,
      infoTooltip: 'Policies in the book that current world events may touch. '
        + 'Matching runs locally against the portfolio; no policy data leaves your network.',
    });
  }

  /** Which line of business the header switcher currently has selected. */
  private currentLobLabel(): string | null {
    return getLobMeta(SITE_VARIANT)?.label ?? null;
  }

  public async fetchData(): Promise<boolean> {
    if (!this.loaded) this.showLoading('Loading portfolio…');
    try {
      const res = await fetch(PORTFOLIO_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = parsePortfolioTsv(await res.text());
      this.policies = rows.map((r, i) => normalizePolicy(r, r['Policy Reference'] || `ROW-${i + 1}`));
      this.loaded = true;
      this.render();
      return true;
    } catch (err) {
      if (!this.loaded) {
        this.showError('Portfolio unavailable', () => void this.fetchData());
      }
      console.warn('[portfolio-exposure] failed to load portfolio', err);
      return false;
    }
  }

  /** Policies on the selected line, or the whole book on the catalogue view. */
  private scopedPolicies(): NormalizedPolicy[] {
    const lob = this.currentLobLabel();
    if (!lob) return this.policies;
    const want = lob.toLowerCase();
    const scoped = this.policies.filter((p) => p.lob.toLowerCase() === want);
    // "All Panels & Layers" is a catalogue view, not an underwriting line — it
    // has no policies of its own, so show the whole book rather than nothing.
    return scoped.length > 0 ? scoped : this.policies;
  }

  private buildCards(): ExposureCard[] {
    const scoped = this.scopedPolicies();
    const cards: ExposureCard[] = [];

    for (const event of DEMO_EVENTS) {
      const matches = scoped.map((p) => matchPolicy(p, event));
      const hits = matches.filter((m) => m.matched);
      if (hits.length === 0) continue;
      // Totals come from the same redaction path the model would be handed, so
      // what the underwriter reads and what a model could read cannot diverge.
      const { payload } = buildModelPayload(matches, event);
      cards.push({
        event,
        hits: hits.sort((a, b) => (b.policy.netExposureUsd ?? 0) - (a.policy.netExposureUsd ?? 0)),
        policyCount: payload.cohort.policyCount,
        netExposureUsd: payload.cohort.netExposureUsd,
        aggregateLimitUsd: payload.cohort.aggregateLimitUsd,
      });
    }
    return cards.sort((a, b) => b.netExposureUsd - a.netExposureUsd);
  }

  private render(): void {
    const cards = this.buildCards();
    this.setCount(cards.length);

    const lob = this.currentLobLabel();
    const scoped = this.scopedPolicies();
    const matcher = scoped[0] ? matcherFor(scoped[0]) : null;

    const summary = h('div', { className: 'pxp-summary' },
      h('span', { className: 'pxp-summary-scope' },
        lob ? `${lob} · ${scoped.length} policies` : `${scoped.length} policies`),
      h('span', { className: 'pxp-summary-matcher' },
        matcher ? `matched on ${matcher.label.toLowerCase()}` : 'no matcher for this line'),
    );

    if (cards.length === 0) {
      replaceChildren(this.content, summary, h('div', { className: 'pxp-empty' },
        'No exposure from the current event set.'));
      this.setSeverity('none');
      return;
    }

    const totalNet = cards.reduce((s, c) => s + c.netExposureUsd, 0);
    const totalPolicies = new Set(cards.flatMap((c) => c.hits.map((h2) => h2.policy.ref))).size;

    const headline = h('div', { className: 'pxp-headline' },
      h('div', { className: 'pxp-headline-stat' },
        h('span', { className: 'pxp-figure' }, money(totalNet)),
        h('span', { className: 'pxp-figure-label' }, 'net exposure touched'),
      ),
      h('div', { className: 'pxp-headline-stat' },
        h('span', { className: 'pxp-figure' }, String(totalPolicies)),
        h('span', { className: 'pxp-figure-label' }, totalPolicies === 1 ? 'policy' : 'policies'),
      ),
      h('div', { className: 'pxp-headline-stat' },
        h('span', { className: 'pxp-figure' }, String(cards.length)),
        h('span', { className: 'pxp-figure-label' }, cards.length === 1 ? 'event' : 'events'),
      ),
    );

    replaceChildren(this.content, summary, headline,
      ...cards.map((card) => this.renderCard(card)));

    this.setSeverity(totalNet > 100_000_000 ? 'high' : totalNet > 25_000_000 ? 'medium' : 'low');
  }

  private renderCard(card: ExposureCard): HTMLElement {
    const { event } = card;

    const goToSource = (): void => {
      revealPanel(event.sourcePanel);
      track('exposure-drilldown', { panel: event.sourcePanel, event: event.id });
    };

    const headlineBtn = h('button', {
      className: 'pxp-card-headline',
      type: 'button',
      title: `Go to the ${event.sourcePanel} panel`,
    }, event.headline);
    headlineBtn.addEventListener('click', goToSource);

    const rows = card.hits.slice(0, MAX_ROWS_PER_CARD).map((m) => {
      const party = m.policy.insuredName ?? m.policy.obligor ?? m.policy.ref;
      // The last passing test is the one that established the nexus — that is
      // the sentence an underwriter needs, not the whole checklist.
      const why = m.reasons.filter((r) => r.passed).slice(-1)[0]?.detail ?? '';
      return h('div', { className: 'pxp-row' },
        h('span', { className: 'pxp-row-party' }, party),
        h('span', { className: 'pxp-row-amount' }, money(m.policy.netExposureUsd ?? 0)),
        h('span', { className: 'pxp-row-why' }, why),
      );
    });

    const extra = card.hits.length - MAX_ROWS_PER_CARD;
    if (extra > 0) {
      rows.push(h('div', { className: 'pxp-row pxp-row-more' },
        h('span', { className: 'pxp-row-party' }, `+${extra} more ${extra === 1 ? 'policy' : 'policies'}`)));
    }

    const caveats = [...new Set(card.hits.flatMap((m) => m.limitations))];

    return h('div', { className: 'pxp-card' },
      headlineBtn,
      h('div', { className: 'pxp-card-meta' },
        h('span', {}, event.peril),
        h('span', { className: 'pxp-dot' }, '·'),
        h('span', {}, event.countries.join(', ')),
        h('span', { className: 'pxp-dot' }, '·'),
        h('span', {}, formatDate(event.occurredAt)),
      ),
      h('div', { className: 'pxp-card-stats' },
        h('strong', {}, money(card.netExposureUsd)),
        h('span', {}, ` net across ${card.policyCount} ${card.policyCount === 1 ? 'policy' : 'policies'}`),
        h('span', { className: 'pxp-limit' }, ` of ${money(card.aggregateLimitUsd)} limit`),
      ),
      h('div', { className: 'pxp-rows' }, ...rows),
      ...(caveats.length > 0
        ? [h('div', { className: 'pxp-caveats' }, ...caveats.map((c) => h('div', {}, c)))]
        : []),
    );
  }

  /** Re-render on LOB switch without re-fetching the portfolio. */
  public refreshForLob(): void {
    if (this.loaded) this.render();
  }
}
