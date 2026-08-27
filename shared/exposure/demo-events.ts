/**
 * Seeded events for the Exposure Lens demo.
 *
 * These are hand-written so a demo always has something to show — a live
 * dashboard on a quiet news day is a bad place to prove a concept. Each one
 * carries the panel it would have arrived from, so the exposure card can link
 * back into the dashboard exactly as a live event would.
 *
 * Everything here is fictional. Real countries and sectors, invented incidents.
 */

import type { WorldEvent } from './exposure-core';

export const DEMO_EVENTS: readonly WorldEvent[] = [
  {
    id: 'demo-bogota',
    headline: 'Coordinated bombings strike financial district in Bogotá; state of emergency declared',
    peril: 'Terrorism / explosive attack',
    triggersClasses: ['War and Terrorism'],
    countries: ['Colombia'],
    entities: [],
    sectors: ['Financial and insurance activities'],
    occurredAt: '2026-06-15',
    sourceUrl: 'https://example.invalid/demo/bogota',
    sourcePanel: 'threat-timeline',
  },
  {
    id: 'demo-us-unrest',
    headline: 'Widespread civil unrest and arson across several US cities',
    peril: 'Riot / civil commotion',
    triggersClasses: ['War and Terrorism'],
    countries: ['United States'],
    entities: [],
    sectors: ['Wholesale and retail trade'],
    occurredAt: '2026-06-15',
    sourceUrl: 'https://example.invalid/demo/us-unrest',
    sourcePanel: 'unrest',
  },
  {
    id: 'demo-niger-delta',
    headline: 'Militants sabotage export pipeline in the Niger Delta; crude release reported',
    peril: 'Sabotage / politically motivated damage',
    triggersClasses: ['War and Terrorism', 'Pollution Legal Liability'],
    countries: ['Nigeria'],
    entities: ['Anseri National Petroleum'],
    sectors: ['Energy', 'Mining and quarrying'],
    occurredAt: '2026-06-02',
    sourceUrl: 'https://example.invalid/demo/niger-delta',
    sourcePanel: 'pipeline-status',
  },
  {
    id: 'demo-mexico-grid',
    headline: 'Mexican regulator moves to curtail private power contracts, prioritising state grid dispatch',
    peril: 'Contract repudiation / regulatory action by state entity',
    triggersClasses: ['Contract Frustration'],
    countries: ['Mexico'],
    entities: ['Estrella Grid Corporation'],
    sectors: ['Energy'],
    occurredAt: '2026-05-20',
    sourceUrl: 'https://example.invalid/demo/mexico-grid',
    sourcePanel: 'intel',
  },
  {
    id: 'demo-chile-power',
    headline: 'Chilean state power authority misses scheduled payments to independent generators',
    peril: 'Payment default by state-owned counterparty',
    triggersClasses: ['Contract Frustration'],
    countries: ['Chile'],
    entities: ['Meridian Power Authority'],
    sectors: ['Energy'],
    occurredAt: '2026-04-18',
    sourceUrl: 'https://example.invalid/demo/chile-power',
    sourcePanel: 'economic',
  },
  {
    id: 'demo-msp-ransomware',
    headline: 'Ransomware operators claim breach of managed cloud provider serving European retail clients',
    peril: 'Ransomware / supply-chain compromise',
    triggersClasses: ['Cyber Liability'],
    countries: ['United Kingdom', 'Netherlands'],
    entities: ['Arcadia Cloud Services Ltd'],
    sectors: ['Information and communication'],
    occurredAt: '2026-06-09',
    sourceUrl: 'https://example.invalid/demo/msp-ransomware',
    sourcePanel: 'cyber-threats',
  },
  {
    id: 'demo-bank-enforcement',
    headline: 'Regulator opens enforcement action against mid-tier bank over sanctions-screening failures',
    peril: 'Regulatory enforcement / professional failure',
    triggersClasses: ['FI Professional Indemnity'],
    countries: ['United States'],
    entities: ['Cardinal Union Bank NA'],
    sectors: ['Financial and insurance activities'],
    occurredAt: '2026-06-11',
    sourceUrl: 'https://example.invalid/demo/bank-enforcement',
    sourcePanel: 'sanctions-pressure',
  },
  {
    id: 'demo-advisory-claim',
    headline: 'Class action filed against advisory firm over valuation work on collapsed infrastructure fund',
    peril: 'Professional negligence claim',
    triggersClasses: ['Professional Indemnity'],
    countries: ['United Kingdom'],
    entities: ['Calder & Vance LLP'],
    sectors: ['Financial and insurance activities'],
    occurredAt: '2026-05-28',
    sourceUrl: 'https://example.invalid/demo/advisory-claim',
    sourcePanel: 'intel',
  },
];
